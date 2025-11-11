
import { JobQueue } from './jobQueue';
import { storage } from './storage';

export class TranscriptionWorker {
  private static isRunning = false;
  private static pollInterval: NodeJS.Timeout | null = null;
  private static readonly POLL_INTERVAL_MS = 5000; // 5 seconds

  static start(): void {
    if (this.isRunning) {
      console.log('[WORKER] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[WORKER] ✅ Started - polling every', this.POLL_INTERVAL_MS / 1000, 'seconds');

    // Start polling immediately
    this.processQueue();

    // Then continue polling
    this.pollInterval = setInterval(() => {
      this.processQueue();
    }, this.POLL_INTERVAL_MS);
  }

  static stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('[WORKER] Stopped');
  }

  private static async processQueue(): Promise<void> {
    try {
      const job = await JobQueue.dequeue();
      
      if (!job) {
        // No jobs in queue
        return;
      }

      console.log('[WORKER] Processing job:', job.id, 'recording:', job.recordingId);

      try {
        await this.transcribeRecording(job.recordingId, job.userId);
        await JobQueue.markCompleted(job.id);
        console.log('[WORKER] ✅ Job completed:', job.id);
      } catch (error) {
        console.error('[WORKER] ❌ Job failed:', job.id, error);
        
        if (job.attempts < 3) {
          // Requeue for retry
          await JobQueue.requeue(job.id);
          console.log('[WORKER] Job requeued for retry:', job.id);
        } else {
          // Max attempts reached
          await JobQueue.markFailed(job.id, error instanceof Error ? error.message : 'Unknown error');
          
          // Also mark recording as failed
          await storage.updateRecording(job.recordingId, { status: 'failed' });
        }
      }

      // Process next job immediately if available
      const pendingCount = await JobQueue.getPendingCount();
      if (pendingCount > 0) {
        console.log('[WORKER] 📋', pendingCount, 'jobs pending, processing next...');
        // Use setTimeout to avoid blocking
        setTimeout(() => this.processQueue(), 100);
      }
    } catch (error) {
      console.error('[WORKER] Error processing queue:', error);
    }
  }

  private static async transcribeRecording(recordingId: string, userId: string): Promise<void> {
    console.log('[WORKER] Starting transcription for:', recordingId);

    const recording = await storage.getRecording(recordingId);
    if (!recording) {
      throw new Error('Recording not found');
    }

    const settings = await storage.getUserSettings(userId);
    if (!settings?.mistralApiKey) {
      throw new Error('No Mistral API key configured');
    }

    // Update status to transcribing
    await storage.updateRecording(recordingId, { status: 'transcribing' });

    // Get audio data
    if (!recording.audioUrl) {
      throw new Error('No audio URL in recording');
    }

    const audioData = recording.audioUrl.split(',')[1];
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Call Mistral Voxtral API
    const mistralSTTModel = process.env.MISTRAL_STT_MODEL || 'voxtral-24.02';
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', mistralSTTModel);

    console.log('[WORKER] Calling Mistral API for transcription...');
    const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.mistralApiKey}`,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      const errorText = await transcriptionResponse.text();
      throw new Error(`Transcription failed: ${transcriptionResponse.statusText} - ${errorText}`);
    }

    const transcriptionData = await transcriptionResponse.json();
    const transcript = transcriptionData.text;

    // Summarize with Mistral
    const defaultTemplate = 'Du bist ein Assistent, der Audio-Notizen zusammenfasst. Erstelle eine strukturierte Zusammenfassung im Markdown-Format mit Hauptpunkten und wichtigen Details.';
    const systemPrompt = settings.summaryTemplate || defaultTemplate;

    console.log('[WORKER] Generating summary...');
    const summaryResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Bitte fasse diese Notiz zusammen:\n\n${transcript}` }
        ],
      }),
    });

    if (!summaryResponse.ok) {
      throw new Error(`Summarization failed: ${summaryResponse.statusText}`);
    }

    const summaryData = await summaryResponse.json();
    const summary = summaryData.choices[0].message.content;

    // Generate title
    console.log('[WORKER] Generating title...');
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
          { role: 'user', content: `Erstelle einen kurzen Titel für diese Notiz:\n\n${transcript}` }
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

    // Update recording
    await storage.updateRecording(recordingId, {
      title,
      transcript,
      summary,
      status: 'transcribed',
    });

    // Save to GitHub if configured
    if (settings.githubRepoOwner && settings.githubRepoName) {
      console.log('[WORKER] Saving to GitHub...');
      await this.saveToGitHub(recordingId, userId);
    }

    console.log('[WORKER] Transcription completed successfully');
  }

  private static async saveToGitHub(recordingId: string, userId: string): Promise<void> {
    const recording = await storage.getRecording(recordingId);
    const user = await storage.getUser(userId);
    const settings = await storage.getUserSettings(userId);

    if (!recording || !user || !settings || !user.accessToken) {
      throw new Error('Missing required data for GitHub save');
    }

    if (!settings.githubRepoOwner || !settings.githubRepoName) {
      throw new Error('GitHub repository not configured');
    }

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
    await storage.updateRecording(recordingId, {
      githubFileUrl: fileData.content.html_url,
    });
  }
}
