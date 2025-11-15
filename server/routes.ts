import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import { storage, databaseService } from "./storage";
import { ReplitSessionStore } from "./replitSessionStore";
import { AuthenticationService } from "./authenticationService";
import { insertRecordingSchema, updateRecordingSchema, updateUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { JobQueue } from "./jobQueue";
import { TranscriptionWorker } from "./transcriptionWorker";
import { MistralService } from "./mistralService";
import { GitHubService } from "./githubService";

// Create singleton instances with dependency injection
// AuthenticationService handles all OAuth operations
const authService = new AuthenticationService(storage);
const mistralService = new MistralService();
const githubService = new GitHubService(storage);
const jobQueue = new JobQueue(databaseService);
const transcriptionWorker = new TranscriptionWorker(jobQueue, storage, mistralService, githubService);

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Session middleware
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    returnPath?: string;
  }
}

// Auth middleware using AuthenticationService
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authService.authenticateRequest(req);

  if (!user) {
    console.log('[AUTH] Authentication failed - sessionID:', req.sessionID);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
  }

  console.log('[AUTH] User authenticated:', user.id);
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Start background transcription worker
  transcriptionWorker.start();
  console.log('[SERVER] 🚀 Background transcription worker started');

  // Trust proxy - wichtig für Replit Deployments (HTTPS Proxy)
  app.set('trust proxy', 1);

  // Serve service worker with correct MIME type
  app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile('service-worker.js', { root: './public' });
  });

  // Session configuration with Replit Database Store
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(
    session({
      store: new ReplitSessionStore(databaseService),
      secret: process.env.SESSION_SECRET || 'audio-notes-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction, // Only secure in production
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: undefined, // Let browser set domain automatically
      },
      name: 'connect.sid', // Explicit session cookie name
    })
  );

  // GitHub OAuth routes
  app.get('/api/auth/github', (req, res) => {
    if (!authService.isConfigured()) {
      return res.status(500).send('GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
    }

    // Store return path from query parameter
    const returnPath = req.query.returnPath as string;
    if (returnPath) {
      req.session.returnPath = returnPath;
    }

    const authUrl = authService.getAuthorizationUrl(req);
    if (!authUrl) {
      return res.status(500).send('Failed to generate authorization URL');
    }

    res.redirect(authUrl);
  });

  app.get('/api/auth/github/callback', async (req, res) => {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.redirect('/?error=no_code');
    }

    if (!authService.isConfigured()) {
      return res.redirect('/?error=oauth_not_configured');
    }

    try {
      const result = await authService.authenticateWithCode(code);

      if (!result.success || !result.user) {
        return res.redirect(`/?error=${result.error || 'oauth_failed'}`);
      }

      try {
        // Create session and wait for it to be saved
        await authService.createSession(req, result.user.id);

        console.log('[AUTH] ========================================');
        console.log('[AUTH] Session created successfully');
        console.log('[AUTH] SessionID:', req.sessionID);
        console.log('[AUTH] Session userId:', req.session.userId);
        console.log('[AUTH] Session returnPath:', req.session.returnPath);
        console.log('[AUTH] Cookie settings:', {
          httpOnly: req.session.cookie.httpOnly,
          secure: req.session.cookie.secure,
          sameSite: req.session.cookie.sameSite,
          domain: req.session.cookie.domain,
          path: req.session.cookie.path,
          maxAge: req.session.cookie.maxAge
        });
        console.log('[AUTH] ========================================');

        // Redirect to stored return path or default to home
        const returnPath = req.session.returnPath || '/';
        delete req.session.returnPath; // Clean up after use

        console.log('[AUTH] ========================================');
        console.log('[AUTH] 🔀 Redirecting to:', returnPath);
        console.log('[AUTH] Full redirect URL:', `${returnPath}?authenticated=true&token=${encodeURIComponent(result.user.id)}`);
        console.log('[AUTH] ========================================');

        res.redirect(`${returnPath}?authenticated=true&token=${encodeURIComponent(result.user.id)}`);
      } catch (sessionError) {
        console.error('[AUTH] Session creation failed:', sessionError);
        return res.redirect('/?error=session_failed');
      }
    } catch (error) {
      console.error('[AUTH] OAuth callback error:', error);
      res.redirect('/?error=oauth_failed');
    }
  });

  app.get('/api/auth/token', requireAuth, async (req, res) => {
    const userId = authService.getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      token: userId,
      expiresIn: 30 * 24 * 60 * 60
    });
  });

  app.get('/api/auth/user', async (req, res) => {
    console.log('[AUTH] ========================================');
    console.log('[AUTH] /api/auth/user called');
    console.log('[AUTH] Timestamp:', new Date().toISOString());
    console.log('[AUTH] Session ID:', req.sessionID);
    console.log('[AUTH] Cookies received:', req.headers.cookie);
    console.log('[AUTH] Session data:', JSON.stringify(req.session, null, 2));
    console.log('[AUTH] Authorization header:', req.headers.authorization);
    console.log('[AUTH] ========================================');

    const userId = authService.getUserIdFromRequest(req);
    console.log('[AUTH] ========================================');
    console.log('[AUTH] getUserIdFromRequest result:', userId);
    console.log('[AUTH] ========================================');

    if (!userId) {
      console.log('[AUTH] ========================================');
      console.log('[AUTH] ❌ No userId found in session or token');
      console.log('[AUTH] Returning 401 Unauthorized');
      console.log('[AUTH] ========================================');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('[AUTH] ========================================');
    console.log('[AUTH] 🔍 Looking up user:', userId);
    console.log('[AUTH] ========================================');

    const safeUser = await authService.getSafeUser(userId);

    console.log('[AUTH] ========================================');
    console.log('[AUTH] getSafeUser result:', safeUser);
    console.log('[AUTH] ========================================');

    if (!safeUser) {
      console.log('[AUTH] ========================================');
      console.log('[AUTH] ❌ User not found for userId:', userId);
      console.log('[AUTH] Returning 404 Not Found');
      console.log('[AUTH] ========================================');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[AUTH] ========================================');
    console.log('[AUTH] ✅ User found and returning data');
    console.log('[AUTH] User:', { id: safeUser.id, username: safeUser.username });
    console.log('[AUTH] ========================================');

    // Retry failed recordings on login
    const userSettings = await storage.getUserSettings(userId);
    if (userSettings?.mistralApiKey) {
      console.log('[AUTH] ✅ Mistral API key found - checking for failed recordings to retry');

      const recordings = await storage.getRecordingsByUserId(userId);
      const failedRecordings = recordings.filter(r => r.status === 'failed');

      if (failedRecordings.length > 0) {
        console.log(`[AUTH] 🔄 Found ${failedRecordings.length} failed recording(s) - queueing for retry`);

        for (const recording of failedRecordings) {
          console.log(`[AUTH] Queueing failed recording: ${recording.id}`);

          // Reset status to pending
          await storage.updateRecording(recording.id, { status: 'pending' });

          // Add to job queue
          await jobQueue.enqueue(recording.id, userId);
        }

        // Only notify worker if we actually queued jobs
        console.log('[AUTH] 🔔 Notifying worker of newly queued failed recordings');
        transcriptionWorker.notifyNewJob().catch(err => 
          console.error('[AUTH] Failed to notify worker after queueing failed recordings:', err)
        );
      } else {
        console.log('[AUTH] No failed recordings found to retry - skipping worker notification');
      }
    } else {
      console.log('[AUTH] ⚠️ No Mistral API key configured - skipping failed recordings retry');
    }

    res.json(safeUser);
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      await authService.destroySession(req);
      res.json({ success: true, clearToken: true });
    } catch (error) {
      console.error('[AUTH] Logout failed:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // Settings routes
  app.get('/api/settings', requireAuth, async (req, res) => {
    const settings = await storage.getUserSettings(req.session.userId!);
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    res.json(settings);
  });

  app.patch('/api/settings', requireAuth, async (req, res) => {
    try {
      console.log('[SETTINGS] Update request for user:', req.session.userId);
      console.log('[SETTINGS] Request body:', {
        hasMistralKey: !!req.body.mistralApiKey,
        mistralKeyLength: req.body.mistralApiKey?.length || 0,
        hasGithubRepo: !!(req.body.githubRepoOwner && req.body.githubRepoName),
        hasSummaryTemplate: !!req.body.summaryTemplate
      });

      const updates = updateUserSettingsSchema.parse(req.body);
      const settings = await storage.updateUserSettings(req.session.userId!, updates);

      if (!settings) {
        console.error('[SETTINGS] Settings not found for user:', req.session.userId);
        return res.status(404).json({ error: 'Settings not found' });
      }

      console.log('[SETTINGS] Settings updated successfully:', {
        userId: settings.userId,
        hasMistralKey: !!settings.mistralApiKey,
        mistralKeyLength: settings.mistralApiKey?.length || 0
      });

      res.json(settings);
    } catch (error) {
      console.error('[SETTINGS] Update failed:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // GitHub repositories route
  app.get('/api/github/repos', requireAuth, async (req, res) => {
    try {
      const repos = await githubService.fetchRepositories(req.session.userId!);
      res.json(repos);
    } catch (error) {
      console.error('Failed to fetch GitHub repos:', error);
      res.status(500).json({ error: 'Failed to fetch repositories' });
    }
  });

  // Recordings routes
  app.get('/api/recordings', requireAuth, async (req, res) => {
    const recordings = await storage.getRecordingsByUserId(req.session.userId!);

    // Only log if there are processing recordings
    const processingCount = recordings.filter(r => r.status === 'pending' || r.status === 'transcribing').length;
    if (processingCount > 0) {
      console.log(`[API] GET /api/recordings - ${recordings.length} total, ${processingCount} processing`);
    }

    res.json(recordings);
  });

  app.post('/api/recordings', requireAuth, upload.single('audio'), async (req, res) => {
    const logMsg = `\n[ROUTES] ======================================== POST /api/recordings called at ${new Date().toISOString()} for user ${req.session.userId} ======================================== \n`;
    process.stdout.write(logMsg);
    console.log('[ROUTES] ========================================');
    console.log('[ROUTES] POST /api/recordings called');
    console.log('[ROUTES] Timestamp:', new Date().toISOString());
    console.log('[ROUTES] User ID:', req.session.userId);
    console.log('[ROUTES] ========================================');

    try {
      process.stdout.write('[UPLOAD] Recording upload started\n');
      console.log('[UPLOAD] Recording upload started');

      if (!req.file) {
        console.error('[UPLOAD] ❌ No audio file provided in request');
        return res.status(400).json({ error: 'No audio file provided' });
      }

      console.log('[UPLOAD] ✅ File received:', {
        mimetype: req.file.mimetype,
        size: req.file.buffer.length,
        duration: req.body.duration
      });

      const duration = parseInt(req.body.duration || '0');

      // Store audio file as base64
      console.log('[UPLOAD] 🔄 Encoding audio to base64...');
      const audioBase64 = req.file.buffer.toString('base64');
      const audioUrl = `data:${req.file.mimetype};base64,${audioBase64}`;
      console.log('[UPLOAD] ✅ Audio encoded to base64, length:', audioBase64.length);

      // Create recording entry
      console.log('[UPLOAD] 🔄 Creating recording entry in database...');
      let createdRecording;
      try {
        createdRecording = await storage.createRecording({
          userId: req.session.userId!,
          audioUrl,
          duration,
          status: 'pending',
          transcript: null,
          summary: null,
          githubFileUrl: null,
        });
        console.log('[UPLOAD] ✅ Recording created in DB:', {
          id: createdRecording.id,
          userId: createdRecording.userId,
          status: createdRecording.status,
          duration: createdRecording.duration
        });
      } catch (error) {
        console.error('[UPLOAD] ❌ CRITICAL: Failed to create recording in DB');
        console.error('[UPLOAD] Error:', error);
        console.error('[UPLOAD] Stack:', error instanceof Error ? error.stack : 'No stack');
        throw error;
      }

      console.log('[ROUTES] 📤 Sending response to client with recording:', createdRecording.id);
      console.log('[ROUTES] ========================================');

      // Check if user has Mistral API key before queueing
      const userSettings = await storage.getUserSettings(req.session.userId!);
      if (!userSettings?.mistralApiKey) {
        console.log('[ROUTES] ⚠️ No Mistral API key - marking recording as failed');
        await storage.updateRecording(createdRecording.id, { 
          status: 'failed',
        });
        res.json(createdRecording);
        return;
      }

      // Enqueue transcription job
      console.log('[ROUTES] ========================================');
      console.log('[ROUTES] 📋 QUEUEING TRANSCRIPTION JOB');
      console.log('[ROUTES] Recording ID:', createdRecording.id);
      console.log('[ROUTES] User ID:', req.session.userId);
      console.log('[ROUTES] ========================================');

      await jobQueue.enqueue(createdRecording.id, req.session.userId!);

      // Notify worker of new job
      console.log('[ROUTES] ========================================');
      console.log('[ROUTES] 🔔 NOTIFYING WORKER OF NEW JOB');
      console.log('[ROUTES] About to call transcriptionWorker.notifyNewJob()');
      console.log('[ROUTES] ========================================');

      try {
        await transcriptionWorker.notifyNewJob();

        console.log('[ROUTES] ========================================');
        console.log('[ROUTES] ✅ WORKER NOTIFICATION COMPLETED');
        console.log('[ROUTES] notifyNewJob() returned successfully');
        console.log('[ROUTES] ========================================');
      } catch (error) {
        console.error('[ROUTES] ❌ CRITICAL: Worker notification failed');
        console.error('[ROUTES] Error:', error);
        console.error('[ROUTES] Stack:', error instanceof Error ? error.stack : 'No stack');
        // Don't throw - recording was saved, just worker notification failed
      }

      // Send response immediately
      console.log('[ROUTES] 📤 Sending response to client with recording:', createdRecording.id);
      res.json(createdRecording);

      console.log('[ROUTES] ========================================');
      console.log('[ROUTES] POST /api/recordings completed successfully');
      console.log('[ROUTES] ========================================');
    } catch (error) {
      console.error('[UPLOAD] ========================================');
      console.error('[UPLOAD] ❌ UPLOAD FAILED');
      console.error('[UPLOAD] Error:', error);
      console.error('[UPLOAD] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('[UPLOAD] ========================================');
      res.status(500).json({ error: 'Failed to create recording' });
    }
  });

  app.patch('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const recording = await storage.getRecording(id);

      if (!recording || recording.userId !== req.session.userId) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      const updates = updateRecordingSchema.parse(req.body);
      const updated = await storage.updateRecording(id, updates);

      res.json(updated);
    } catch (error) {
      console.error('Recording update error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: 'Failed to update recording' });
    }
  });

  app.post('/api/recordings/:id/transcribe', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const recording = await storage.getRecording(id);

      if (!recording || recording.userId !== req.session.userId) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      // Get user settings for Mistral API key
      const settings = await storage.getUserSettings(req.session.userId!);
      if (!settings?.mistralApiKey) {
        return res.status(400).json({ error: 'Mistral API key not configured' });
      }

      // Update status to transcribing
      await storage.updateRecording(id, { status: 'transcribing' });

      // Convert base64 audio back to blob for Mistral API
      if (!recording.audioUrl) {
        return res.status(400).json({ error: 'No audio data found' });
      }

      const audioData = recording.audioUrl.split(',')[1];
      const audioBuffer = Buffer.from(audioData, 'base64');

      // Use MistralService for transcription
      const transcriptionResult = await mistralService.transcribeAudio(audioBuffer, settings.mistralApiKey);
      const transcript = transcriptionResult.text;

      // Use MistralService for combined summary and title generation
      let title = 'Audio-Notiz';
      let summary = '';
      try {
        const result = await mistralService.generateSummaryAndTitle(
          transcript,
          settings.mistralApiKey,
          settings.summaryTemplate || undefined
        );
        title = result.title;
        summary = result.summary;
      } catch (error) {
        console.warn('Summary and title generation failed, using defaults:', error);
      }

      // Update recording with transcript and summary
      await storage.updateRecording(id, {
        title,
        transcript,
        summary,
        status: 'transcribed',
      });

      // Save to GitHub if configured
      if (settings.githubRepoOwner && settings.githubRepoName) {
        await githubService.saveRecordingToGitHub({ recordingId: id, userId: req.session.userId! });
      }

      const updatedRecording = await storage.getRecording(id);
      res.json(updatedRecording);
    } catch (error) {
      console.error('Transcription/summarization error:', error);
      await storage.updateRecording(req.params.id, { status: 'failed' });
      res.status(500).json({ error: 'Transcription failed' });
    }
  });



  // Health check endpoint for production monitoring
  app.get('/health', async (req, res) => {
    try {
      // Check database connection
      await databaseService.get('health-check');

      // Check worker status
      const workerStatus = transcriptionWorker.getStatus();

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'up',
          worker: workerStatus ? 'up' : 'down',
        },
        environment: process.env.NODE_ENV || 'development',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(503).json({ 
        status: 'unhealthy', 
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  });

  const httpServer = createServer(app);

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    console.log(`\n[SERVER] ${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(() => {
      console.log('[SERVER] HTTP server closed');

      // Stop the transcription worker
      transcriptionWorker.stop();
      console.log('[SERVER] Transcription worker stopped');

      console.log('[SERVER] Graceful shutdown complete');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('[SERVER] Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return httpServer;
}