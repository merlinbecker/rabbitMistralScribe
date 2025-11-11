import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import { storage } from "./storage";
import { ReplitSessionStore } from "./replitSessionStore";
import { insertRecordingSchema, updateRecordingSchema, updateUserSettingsSchema } from "@shared/schema";
import { z } from "zod";

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

// Auth middleware with Bearer token support
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let userId = req.session.userId;

  // Check for Bearer token if session is not available
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
      console.log('[AUTH] Using Bearer token for auth, userId:', userId);
    }
  }

  if (!userId) {
    console.log('[AUTH] No authentication found - session userId:', req.session.userId, 'sessionID:', req.sessionID);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
  }

  // Verify user exists
  const user = await storage.getUser(userId);
  if (!user) {
    console.log('[AUTH] User not found for userId:', userId);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'User not found'
    });
  }

  // Store userId in session for consistency
  req.session.userId = userId;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve service worker with correct MIME type
  app.get('/service-worker.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile('service-worker.js', { root: './public' });
  });

  // Session configuration with Replit Database Store
  app.use(
    session({
      store: new ReplitSessionStore(),
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
    const clientId = process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      return res.status(500).send('GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
    }

    // Construct the correct redirect URI using the request protocol and host
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/github/callback`;
    const scope = 'repo,user';

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    res.redirect(authUrl);
  });

  app.get('/api/auth/github/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.redirect('/?error=no_code');
    }

    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect('/?error=oauth_not_configured');
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return res.redirect('/?error=no_token');
      }

      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const githubUser = await userResponse.json();

      // Find or create user
      let user = await storage.getUserByGitHubId(githubUser.id.toString());

      if (!user) {
        user = await storage.createUser({
          githubId: githubUser.id.toString(),
          username: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          accessToken,
        });

        // Create default settings
        await storage.createUserSettings({
          userId: user.id,
          mistralApiKey: null,
          githubRepoOwner: null,
          githubRepoName: null,
        });
      } else {
        // Update access token if it changed
        if (user.accessToken !== accessToken) {
          await storage.updateUser(user.id, {
            accessToken: accessToken
          });
        }
      }

      // Create session and save it
      req.session.userId = user.id;

      // Save session and wait for it to complete before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('[AUTH] Session save error:', err);
          return res.redirect('/?error=session_failed');
        }
        console.log('[AUTH] Session saved successfully for user:', user.id);
        console.log('[AUTH] SessionID:', req.sessionID);
        // Redirect with token in URL for client to store
        res.redirect(`/?authenticated=true&token=${encodeURIComponent(user.id)}`);
      });
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      res.redirect('/?error=oauth_failed');
    }
  });

  // New endpoint to get session token for localStorage
  app.get('/api/auth/token', requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return a session token (using userId as token for simplicity)
    // In production, you'd want to generate a proper JWT
    res.json({
      token: req.session.userId,
      expiresIn: 30 * 24 * 60 * 60 // 30 days in seconds
    });
  });

  app.get('/api/auth/user', async (req, res) => {
    console.log('[AUTH] /api/auth/user called');
    console.log('[AUTH] Session ID:', req.sessionID);
    console.log('[AUTH] Session userId:', req.session.userId);

    // Check for Bearer token first
    const authHeader = req.headers.authorization;
    let userId = req.session.userId;

    if (!userId && authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log('[AUTH] Using Bearer token, userId:', userId);
    }

    if (!userId) {
      console.log('[AUTH] No userId found in session or token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.log('[AUTH] User not found for userId:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[AUTH] User found:', { id: user.id, username: user.username });

    // Don't send access token to frontend
    const { accessToken, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true, clearToken: true });
    });
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
    res.json(recordings);
  });

  app.post('/api/recordings', requireAuth, upload.single('audio'), async (req, res) => {
    try {
      console.log('[UPLOAD] Recording upload started');

      if (!req.file) {
        console.error('[UPLOAD] No audio file provided in request');
        return res.status(400).json({ error: 'No audio file provided' });
      }

      console.log('[UPLOAD] File received:', {
        mimetype: req.file.mimetype,
        size: req.file.buffer.length,
        duration: req.body.duration
      });

      const duration = parseInt(req.body.duration || '0');

      // Store audio file as base64 (in production, would use cloud storage)
      const audioBase64 = req.file.buffer.toString('base64');
      const audioUrl = `data:${req.file.mimetype};base64,${audioBase64}`;

      console.log('[UPLOAD] Audio encoded to base64, length:', audioBase64.length);

      // Create recording entry with audio
      const recording = await storage.createRecording({
        userId: req.session.userId!,
        audioUrl,
        duration,
        status: 'pending',
        transcript: null,
        summary: null,
        githubFileUrl: null,
      });

      console.log('[UPLOAD] Recording created in DB:', recording.id);

      // IMMEDIATELY trigger transcription BEFORE sending response
      console.log('[UPLOAD] 🎯 Starting background transcription for:', recording.id);
      
      // Fire-and-forget: start transcription without blocking
      Promise.resolve().then(() => {
        console.log('[UPLOAD] 🔥 Promise.resolve().then() executing NOW');
        return transcribeRecording(recording.id, req.session.userId!);
      }).then(() => {
        console.log('[UPLOAD] ✅ Background transcription completed for:', recording.id);
      }).catch((err) => {
        console.error('[UPLOAD] ❌ Background transcription failed for:', recording.id);
        console.error('[UPLOAD] Error details:', err);
        if (err instanceof Error) {
          console.error('[UPLOAD] Error message:', err.message);
          console.error('[UPLOAD] Error stack:', err.stack);
        }
      });

      // Send response immediately (don't wait for transcription)
      res.json(recording);
    } catch (error) {
      console.error('[UPLOAD] Failed to create recording:', error);
      res.status(500).json({ error: 'Failed to create recording' });
    }
  });

  // Background transcription function
  async function transcribeRecording(recordingId: string, userId: string) {
    try {
      console.log('[TRANSCRIBE] Starting transcription for recording:', recordingId, 'userId:', userId);

      // Add a small delay to ensure DB write has completed
      await new Promise(resolve => setTimeout(resolve, 500));

      const recording = await storage.getRecording(recordingId);
      console.log('[TRANSCRIBE] Raw recording object:', JSON.stringify(recording, null, 2));

      if (!recording) {
        console.error('[TRANSCRIBE] Recording not found:', recordingId);
        await storage.updateRecording(recordingId, { status: 'failed' });
        return;
      }
      console.log('[TRANSCRIBE] Recording loaded successfully:', {
        id: recording.id,
        status: recording.status,
        hasAudio: !!recording.audioUrl,
        audioUrlLength: recording.audioUrl?.length || 0,
        userId: recording.userId
      });

      const settings = await storage.getUserSettings(userId);
      console.log('[TRANSCRIBE] Settings loaded:', {
        userId,
        settingsFound: !!settings,
        hasMistralKey: !!settings?.mistralApiKey,
        mistralKeyLength: settings?.mistralApiKey?.length || 0
      });

      if (!settings?.mistralApiKey) {
        console.error('[TRANSCRIBE] No Mistral API key configured for user:', userId);
        await storage.updateRecording(recordingId, { status: 'failed' });
        return;
      }

      console.log('[TRANSCRIBE] Settings loaded, updating status to transcribing');
      await storage.updateRecording(recordingId, { status: 'transcribing' });

      // Get audio data
      if (!recording.audioUrl) {
        console.error('[TRANSCRIBE] No audio URL in recording:', recordingId);
        await storage.updateRecording(recordingId, { status: 'failed' });
        return;
      }

      console.log('[TRANSCRIBE] Extracting audio data from URL');
      const audioData = recording.audioUrl.split(',')[1];
      const audioBuffer = Buffer.from(audioData, 'base64');

      console.log('[TRANSCRIBE] Audio buffer created, size:', audioBuffer.length);

      // Call Mistral Voxtral API
      const mistralSTTModel = process.env.MISTRAL_STT_MODEL || 'voxtral-24.02';
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', mistralSTTModel);

      console.log('[TRANSCRIBE] Sending request to Mistral API:', {
        blobSize: blob.size,
        blobType: blob.type,
        model: mistralSTTModel
      });

      const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
        },
        body: formData,
      });

      console.log('[TRANSCRIBE] Mistral API response status:', transcriptionResponse.status);

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error('[TRANSCRIBE] Mistral API error response:', {
          status: transcriptionResponse.status,
          statusText: transcriptionResponse.statusText,
          body: errorText
        });
        throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;

      console.log('[TRANSCRIBE] Transcription successful, length:', transcript?.length || 0);

      // Summarize with Mistral using custom template if available
      const defaultTemplate = 'Du bist ein Assistent, der Audio-Notizen zusammenfasst. Erstelle eine strukturierte Zusammenfassung im Markdown-Format mit Hauptpunkten und wichtigen Details.';
      const systemPrompt = settings.summaryTemplate || defaultTemplate;

      console.log('[TRANSCRIBE] Starting summarization with template:', systemPrompt.substring(0, 50) + '...');

      const summaryResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `Bitte fasse diese Notiz zusammen:\n\n${transcript}`
            }
          ],
        }),
      });

      console.log('[TRANSCRIBE] Summary API response status:', summaryResponse.status);

      if (!summaryResponse.ok) {
        const errorText = await summaryResponse.text();
        console.error('[TRANSCRIBE] Summary API error:', {
          status: summaryResponse.status,
          statusText: summaryResponse.statusText,
          body: errorText
        });
        throw new Error(`Summarization failed: ${summaryResponse.statusText}`);
      }

      const summaryData = await summaryResponse.json();
      const summary = summaryData.choices[0].message.content;

      console.log('[TRANSCRIBE] Summary successful, length:', summary?.length || 0);

      // Generate title (one-line description)
      console.log('[TRANSCRIBE] Generating title...');
      const titleResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
          messages: [
            {
              role: 'system',
              content: 'Du bist ein Assistent, der prägnante Titel erstellt. Erstelle einen einzeiligen Titel (maximal 60 Zeichen) der die Hauptidee zusammenfasst. Antworte nur mit dem Titel, ohne Anführungszeichen oder zusätzlichen Text.'
            },
            {
              role: 'user',
              content: `Erstelle einen kurzen Titel für diese Notiz:\n\n${transcript}`
            }
          ],
        }),
      });

      console.log('[TRANSCRIBE] Title API response status:', titleResponse.status);

      let title = 'Audio-Notiz';
      if (titleResponse.ok) {
        const titleData = await titleResponse.json();
        title = titleData.choices[0].message.content.trim();
        // Ensure title is not too long
        if (title.length > 60) {
          title = title.substring(0, 57) + '...';
        }
        console.log('[TRANSCRIBE] Title generated:', title);
      } else {
        console.error('[TRANSCRIBE] Title generation failed, using default');
      }

      // Update with results
      await storage.updateRecording(recordingId, {
        title,
        transcript,
        summary,
        status: 'transcribed',
      });

      console.log('[TRANSCRIBE] Recording updated with title, transcript and summary');

      // Save to GitHub if configured
      if (settings.githubRepoOwner && settings.githubRepoName) {
        console.log('[TRANSCRIBE] Saving to GitHub:', {
          owner: settings.githubRepoOwner,
          repo: settings.githubRepoName
        });
        await saveToGitHub(recordingId, userId);
      } else {
        console.log('[TRANSCRIBE] GitHub not configured, skipping save');
      }

      console.log('[TRANSCRIBE] Transcription process completed successfully for:', recordingId);
    } catch (error) {
      console.error('[TRANSCRIBE] Transcription error for recording:', recordingId);
      console.error('[TRANSCRIBE] Error details:', error);
      if (error instanceof Error) {
        console.error('[TRANSCRIBE] Error message:', error.message);
        console.error('[TRANSCRIBE] Error stack:', error.stack);
      }
      try {
        await storage.updateRecording(recordingId, { status: 'failed' });
        console.log('[TRANSCRIBE] Recording status set to failed:', recordingId);
      } catch (updateError) {
        console.error('[TRANSCRIBE] Failed to update recording status:', updateError);
      }
    }
  }

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

      // Call Mistral Voxtral API for transcription
      const mistralSTTModel = process.env.MISTRAL_STT_MODEL || 'voxtral-24.02';
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'audio.webm');
      formData.append('model', mistralSTTModel);

      const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        throw new Error(`Transcription failed: ${transcriptionResponse.statusText}`);
      }

      const transcriptionData = await transcriptionResponse.json();
      const transcript = transcriptionData.text;

      // Now summarize with Mistral Agent
      const summaryResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
          messages: [
            {
              role: 'system',
              content: 'Du bist ein Assistent, der Audio-Notizen zusammenfasst. Erstelle eine strukturierte Zusammenfassung im Markdown-Format mit Hauptpunkten und wichtigen Details.'
            },
            {
              role: 'user',
              content: `Bitte fasse diese Notiz zusammen:\n\n${transcript}`
            }
          ],
        }),
      });

      if (!summaryResponse.ok) {
        throw new Error(`Summarization failed: ${summaryResponse.statusText}`);
      }

      const summaryData = await summaryResponse.json();
      const summary = summaryData.choices[0].message.content;

      // Generate title (one-line description)
      const titleResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
          messages: [
            {
              role: 'system',
              content: 'Du bist ein Assistent, der prägnante Titel erstellt. Erstelle einen einzeiligen Titel (maximal 60 Zeichen) der die Hauptidee zusammenfasst. Antworte nur mit dem Titel, ohne Anführungszeichen oder zusätzlichen Text.'
            },
            {
              role: 'user',
              content: `Erstelle einen kurzen Titel für diese Notiz:\n\n${transcript}`
            }
          ],
        }),
      });

      let title = 'Audio-Notiz';
      if (titleResponse.ok) {
        const titleData = await titleResponse.json();
        title = titleData.choices[0].message.content.trim();
        if (title.length > 60) {
          title = title.substring(0, 57) + '...';
        }
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