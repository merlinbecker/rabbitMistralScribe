import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage, databaseService } from "./storage";
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

// Auth middleware using Bearer token only
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[AUTH] No Bearer token provided');
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'Bearer token required'
    });
  }

  const userId = authHeader.substring(7);
  const user = await storage.getUser(userId);

  if (!user) {
    console.log('[AUTH] Invalid token - user not found:', userId);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'Invalid token'
    });
  }

  console.log('[AUTH] User authenticated:', user.id);
  // Store userId in request for route handlers
  (req as any).userId = user.id;
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

  // GitHub OAuth routes
  app.get('/api/auth/github', (req, res) => {
    if (!authService.isConfigured()) {
      return res.status(500).send('GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
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

      const userId = result.user.id;
      
      console.log('[AUTH] ========================================');
      console.log('[AUTH] ✅ OAuth successful');
      console.log('[AUTH] User ID:', userId);
      console.log('[AUTH] Redirecting to root with token...');
      console.log('[AUTH] ========================================');

      // Always redirect to root with token
      res.redirect(`/?token=${encodeURIComponent(userId)}`);
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
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[AUTH] No Bearer token provided');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = authHeader.substring(7);
    const safeUser = await authService.getSafeUser(userId);

    if (!safeUser) {
      console.log('[AUTH] User not found for token:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[AUTH] User authenticated:', safeUser.username);

    // Retry failed recordings on login
    const userSettings = await storage.getUserSettings(userId);
    if (userSettings?.mistralApiKey) {
      const recordings = await storage.getRecordingsByUserId(userId);
      const failedRecordings = recordings.filter(r => r.status === 'failed');

      if (failedRecordings.length > 0) {
        console.log(`[AUTH] Queueing ${failedRecordings.length} failed recording(s) for retry`);

        for (const recording of failedRecordings) {
          await storage.updateRecording(recording.id, { status: 'pending' });
          await jobQueue.enqueue(recording.id, userId);
        }

        transcriptionWorker.notifyNewJob().catch(err => 
          console.error('[AUTH] Failed to notify worker:', err)
        );
      }
    }

    res.json(safeUser);
  });

  app.post('/api/auth/logout', async (req, res) => {
    // With Bearer tokens, logout is client-side (delete token from localStorage)
    res.json({ success: true });
  });

  // Settings routes
  app.get('/api/settings', requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    const settings = await storage.getUserSettings(userId);
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }
    res.json(settings);
  });

  app.patch('/api/settings', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      console.log('[SETTINGS] Update request for user:', userId);
      console.log('[SETTINGS] Request body:', {
        hasMistralKey: !!req.body.mistralApiKey,
        mistralKeyLength: req.body.mistralApiKey?.length || 0,
        hasGithubRepo: !!(req.body.githubRepoOwner && req.body.githubRepoName),
        hasSummaryTemplate: !!req.body.summaryTemplate
      });

      const updates = updateUserSettingsSchema.parse(req.body);
      const settings = await storage.updateUserSettings(userId, updates);

      if (!settings) {
        console.error('[SETTINGS] Settings not found for user:', userId);
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
      const userId = (req as any).userId;
      const repos = await githubService.fetchRepositories(userId);
      res.json(repos);
    } catch (error) {
      console.error('Failed to fetch GitHub repos:', error);
      res.status(500).json({ error: 'Failed to fetch repositories' });
    }
  });

  // Recordings routes
  app.get('/api/recordings', requireAuth, async (req, res) => {
    const userId = (req as any).userId;
    const recordings = await storage.getRecordingsByUserId(userId);

    // Only log if there are processing recordings
    const processingCount = recordings.filter(r => r.status === 'pending' || r.status === 'transcribing').length;
    if (processingCount > 0) {
      console.log(`[API] GET /api/recordings - ${recordings.length} total, ${processingCount} processing`);
    }

    res.json(recordings);
  });

  app.post('/api/recordings', requireAuth, upload.single('audio'), async (req, res) => {
    const userId = (req as any).userId;
    
    console.log('[ROUTES] POST /api/recordings - User:', userId);

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const duration = parseInt(req.body.duration || '0');
      const audioBase64 = req.file.buffer.toString('base64');
      const audioUrl = `data:${req.file.mimetype};base64,${audioBase64}`;

      const createdRecording = await storage.createRecording({
        userId,
        audioUrl,
        duration,
        status: 'pending',
        transcript: null,
        summary: null,
        githubFileUrl: null,
      });

      // Check if user has Mistral API key before queueing
      const userSettings = await storage.getUserSettings(userId);
      if (!userSettings?.mistralApiKey) {
        await storage.updateRecording(createdRecording.id, { status: 'failed' });
        res.json(createdRecording);
        return;
      }

      // Enqueue transcription job
      await jobQueue.enqueue(createdRecording.id, userId);
      transcriptionWorker.notifyNewJob().catch(err => 
        console.error('[ROUTES] Worker notification failed:', err)
      );

      res.json(createdRecording);
    } catch (error) {
      console.error('[UPLOAD] Upload failed:', error);
      res.status(500).json({ error: 'Failed to create recording' });
    }
  });

  app.patch('/api/recordings/:id', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { id } = req.params;
      const recording = await storage.getRecording(id);

      if (!recording || recording.userId !== userId) {
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
      const userId = (req as any).userId;
      const { id } = req.params;
      const recording = await storage.getRecording(id);

      if (!recording || recording.userId !== userId) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      // Get user settings for Mistral API key
      const settings = await storage.getUserSettings(userId);
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
        await githubService.saveRecordingToGitHub({ recordingId: id, userId });
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