import { JobQueue } from './jobQueue';
import { storage } from './storage';
import Database from "@replit/database";

export class TranscriptionWorker {
  private static isRunning = false;
  private static isProcessing = false;

  static start(): void {
    if (this.isRunning) {
      console.log('[WORKER] ⚠️ Already running - ignoring start request');
      console.log('[WORKER] Current state:', {
        isRunning: this.isRunning,
        isProcessing: this.isProcessing,
        timestamp: new Date().toISOString()
      });
      return;
    }

    this.isRunning = true;
    console.log('[WORKER] ✅ Started successfully');
    console.log('[WORKER] Configuration:', {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      mode: 'push-based',
      timestamp: new Date().toISOString()
    });
  }

  static stop(): void {
    console.log('[WORKER] 🛑 Stopping worker...');
    console.log('[WORKER] State before stop:', {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing
    });
    this.isRunning = false;
    console.log('[WORKER] ✅ Stopped');
  }

  // Called when a new job is enqueued
  static async notifyNewJob(): Promise<void> {
    console.log('[WORKER] 🔔 notifyNewJob() called');
    console.log('[WORKER] Current state:', {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      timestamp: new Date().toISOString()
    });

    if (!this.isRunning) {
      console.log('[WORKER] ❌ Not running, ignoring notification');
      return;
    }

    // If already processing, the current processQueue will continue
    if (this.isProcessing) {
      console.log('[WORKER] ℹ️ Already processing, new job will be picked up automatically');
      console.log('[WORKER] Current processing state - job will be queued for next iteration');
      return;
    }

    console.log('[WORKER] ✅ Starting queue processing...');
    await this.processQueue();
  }

  private static async processQueue(): Promise<void> {
    console.log('[WORKER] 🚀 processQueue() started');
    console.log('[WORKER] Setting isProcessing flag to true');
    
    // Mark as processing to prevent concurrent execution
    this.isProcessing = true;

    try {
      console.log('[WORKER] 🔄 Entering job processing loop');
      let jobsProcessed = 0;
      
      // Process jobs until queue is empty
      while (this.isRunning) {
        console.log(`[WORKER] Loop iteration ${jobsProcessed + 1} - fetching next job from queue`);
        const job = await JobQueue.dequeue();

        if (!job) {
          // Queue is empty
          console.log('[WORKER] ✅ Queue is empty - no more jobs to process');
          console.log('[WORKER] Total jobs processed in this run:', jobsProcessed);
          break;
        }

        console.log('[WORKER] 📦 Job dequeued:', {
          jobId: job.id,
          recordingId: job.recordingId,
          userId: job.userId,
          status: job.status,
          attempts: job.attempts,
          timestamp: new Date().toISOString()
        });

        try {
          console.log(`[WORKER] ▶️ Starting transcription for job ${job.id}`);
          const startTime = Date.now();
          
          await this.transcribeRecording(job.recordingId, job.userId);
          await JobQueue.markCompleted(job.id);
          
          const duration = Date.now() - startTime;
          console.log(`[WORKER] ✅ Job completed successfully: ${job.id}`);
          console.log(`[WORKER] Processing time: ${(duration / 1000).toFixed(2)}s`);
          
          jobsProcessed++;
        } catch (error) {
          console.error(`[WORKER] ❌ Job failed: ${job.id}`);
          console.error('[WORKER] Error details:', error);

          if (job.attempts < 3) {
            // Requeue for retry
            console.log(`[WORKER] 🔄 Requeuing job ${job.id} for retry (attempt ${job.attempts + 1}/3)`);
            await JobQueue.requeue(job.id);
          } else {
            // Max attempts reached
            console.log(`[WORKER] ⚠️ Max attempts reached for job ${job.id} - marking as failed`);
            await JobQueue.markFailed(job.id, error instanceof Error ? error.message : 'Unknown error');

            // Also mark recording as failed
            console.log(`[WORKER] Updating recording ${job.recordingId} status to 'failed'`);
            await storage.updateRecording(job.recordingId, { status: 'failed' });
          }
        }

        // Check pending count for logging
        const pendingCount = await JobQueue.getPendingCount();
        console.log(`[WORKER] 📊 Queue status: ${pendingCount} job(s) remaining`);
      }
      
      console.log('[WORKER] 🏁 Queue processing completed');
      console.log(`[WORKER] Summary: ${jobsProcessed} job(s) processed in this run`);
    } catch (error) {
      console.error('[WORKER] ❌ Critical error in processQueue:', error);
      console.error('[WORKER] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    } finally {
      // Mark as no longer processing
      console.log('[WORKER] 🔓 Releasing isProcessing flag');
      this.isProcessing = false;
      console.log('[WORKER] Final state:', {
        isRunning: this.isRunning,
        isProcessing: this.isProcessing,
        timestamp: new Date().toISOString()
      });
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