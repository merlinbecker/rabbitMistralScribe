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

// Create singleton instances with dependency injection
// AuthenticationService handles all OAuth operations
const authService = new AuthenticationService(storage);
const mistralService = new MistralService();
const jobQueue = new JobQueue(databaseService);
const transcriptionWorker = new TranscriptionWorker(jobQueue, storage, mistralService);

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Session middleware
declare module 'express-session' {
  interface SessionData {
    userId?: string;
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

  // Serve service worker with correct MIME type
  app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile('service-worker.js', { root: './public' });
  });

  // Session configuration with Replit Database Store
  app.use(
    session({
      store: new ReplitSessionStore(databaseService),
      secret: process.env.SESSION_SECRET || 'audio-notes-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
    })
  );

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

      try {
        await authService.createSession(req, result.user.id);
        console.log('[AUTH] SessionID:', req.sessionID);
        res.redirect(`/?authenticated=true&token=${encodeURIComponent(result.user.id)}`);
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
    console.log('[AUTH] /api/auth/user called');
    console.log('[AUTH] Session ID:', req.sessionID);

    const userId = authService.getUserIdFromRequest(req);
    if (!userId) {
      console.log('[AUTH] No userId found in session or token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const safeUser = await authService.getSafeUser(userId);
    if (!safeUser) {
      console.log('[AUTH] User not found for userId:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[AUTH] User found:', { id: safeUser.id, username: safeUser.username });

    transcriptionWorker.notifyNewJob().catch(err => 
      console.error('[AUTH] Failed to notify worker on login:', err)
    );

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
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.accessToken) {
        return res.status(401).json({ error: 'GitHub access token not found' });
      }

      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const repos = await response.json();
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

      // Use MistralService for summarization
      const summaryResult = await mistralService.summarizeText(
        transcript,
        settings.mistralApiKey,
        settings.summaryTemplate || undefined
      );
      const summary = summaryResult.summary;

      // Use MistralService for title generation
      let title = 'Audio-Notiz';
      try {
        const titleResult = await mistralService.generateTitle(transcript, settings.mistralApiKey);
        title = titleResult.title;
      } catch (error) {
        console.warn('Title generation failed, using default:', error);
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
        await saveToGitHub(id, req.session.userId!);
      }

      const updatedRecording = await storage.getRecording(id);
      res.json(updatedRecording);
    } catch (error) {
      console.error('Transcription/summarization error:', error);
      await storage.updateRecording(req.params.id, { status: 'failed' });
      res.status(500).json({ error: 'Transcription failed' });
    }
  });

  // Helper function to save to GitHub
  async function saveToGitHub(recordingId: string, userId: string) {
    const recording = await storage.getRecording(recordingId);
    const user = await storage.getUser(userId);
    const settings = await storage.getUserSettings(userId);

    if (!recording || !user || !settings || !user.accessToken) {
      throw new Error('Missing required data for GitHub save');
    }

    if (!settings.githubRepoOwner || !settings.githubRepoName) {
      throw new Error('GitHub repository not configured');
    }

    // Create markdown content with frontmatter
    const timestamp = recording.createdAt ? new Date(recording.createdAt).toISOString() : new Date().toISOString();
    const filename = `audio-note-${timestamp.replace(/[:.]/g, '-')}.md`;

    const markdownContent = `---
title: "${recording.title || 'Audio-Notiz'}"
date: ${timestamp}
duration: ${recording.duration || 0}
summary: |
  ${(recording.summary || 'Keine Zusammenfassung verfügbar').split('\n').join('\n  ')}
---

# ${recording.title || 'Audio-Notiz'}

## Transkript

${recording.transcript || 'Kein Transkript verfügbar'}

---

*Aufnahmedauer: ${recording.duration ? Math.floor(recording.duration / 60) : 0}:${recording.duration ? (recording.duration % 60).toString().padStart(2, '0') : '00'}*
*Erstellt: ${new Date(timestamp).toLocaleString('de-DE')}*
`;

    const encodedContent = Buffer.from(markdownContent).toString('base64');

    // Create file in GitHub repo
    const createFileResponse = await fetch(
      `https://api.github.com/repos/${settings.githubRepoOwner}/${settings.githubRepoName}/contents/audio-notes/${filename}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Audio-Notiz vom ${new Date(timestamp).toLocaleString('de-DE')}`,
          content: encodedContent,
        }),
      }
    );

    if (!createFileResponse.ok) {
      throw new Error(`GitHub file creation failed: ${createFileResponse.statusText}`);
    }

    const fileData = await createFileResponse.json();

    // Update recording with GitHub URL
    await storage.updateRecording(recordingId, {
      githubFileUrl: fileData.content.html_url,
    });
  }

  const httpServer = createServer(app);

  return httpServer;
}