import type { JobQueue } from './jobQueue';
import type { IStorage } from './storage';
import type { IMistralService } from './mistralService';
import type { IGitHubService } from './githubService';

export class TranscriptionWorker {
  private isRunning = false;
  private isProcessing = false;
  private jobQueue: JobQueue;
  private storage: IStorage;
  private mistralService: IMistralService;
  private githubService: IGitHubService;

  constructor(jobQueue: JobQueue, storage: IStorage, mistralService: IMistralService, githubService: IGitHubService) {
    this.jobQueue = jobQueue;
    this.storage = storage;
    this.mistralService = mistralService;
    this.githubService = githubService;
  }

  start(): void {
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

  stop(): void {
    console.log('[WORKER] 🛑 Stopping worker...');
    console.log('[WORKER] State before stop:', {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing
    });
    this.isRunning = false;
    console.log('[WORKER] ✅ Stopped');
  }

  // Check if worker is running (for health checks)
  getStatus(): boolean {
    return this.isRunning;
  }

  // Called when a new job is enqueued
  async notifyNewJob(): Promise<void> {
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

    // Check if there are any pending jobs before starting
    const pendingCount = await this.jobQueue.getPendingCount();
    console.log('[WORKER] 📊 Pending jobs in queue:', pendingCount);
    
    if (pendingCount === 0) {
      console.log('[WORKER] ⏭️ No pending jobs - skipping queue processing');
      return;
    }

    console.log('[WORKER] ✅ Starting queue processing for', pendingCount, 'pending job(s)...');
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
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
        const job = await this.jobQueue.dequeue();

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
          await this.jobQueue.markCompleted(job.id);
          
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
            await this.jobQueue.requeue(job.id);
          } else {
            // Max attempts reached
            console.log(`[WORKER] ⚠️ Max attempts reached for job ${job.id} - marking as failed`);
            await this.jobQueue.markFailed(job.id, error instanceof Error ? error.message : 'Unknown error');

            // Also mark recording as failed
            console.log(`[WORKER] Updating recording ${job.recordingId} status to 'failed'`);
            await this.storage.updateRecording(job.recordingId, { status: 'failed' });
          }
        }

        // Check pending count for logging
        const pendingCount = await this.jobQueue.getPendingCount();
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

  private async transcribeRecording(recordingId: string, userId: string): Promise<void> {
    console.log('[WORKER] ========================================');
    console.log('[WORKER] 🎯 Starting transcription');
    console.log('[WORKER] Recording ID:', recordingId);
    console.log('[WORKER] User ID:', userId);
    console.log('[WORKER] ========================================');

    const recording = await this.storage.getRecording(recordingId);
    if (!recording) {
      console.error('[WORKER] ❌ Recording not found:', recordingId);
      throw new Error('Recording not found');
    }

    console.log('[WORKER] 📦 Recording loaded:', {
      id: recording.id,
      status: recording.status,
      hasAudioUrl: !!recording.audioUrl,
      duration: recording.duration
    });

    const settings = await this.storage.getUserSettings(userId);
    if (!settings?.mistralApiKey) {
      console.error('[WORKER] ❌ No Mistral API key configured for user:', userId);
      throw new Error('No Mistral API key configured');
    }

    console.log('[WORKER] ✅ Mistral API key found, length:', settings.mistralApiKey.length);

    // Update status to transcribing
    console.log('[WORKER] 🔄 Updating status to "transcribing"...');
    await this.storage.updateRecording(recordingId, { status: 'transcribing' });

    // Get audio data
    if (!recording.audioUrl) {
      throw new Error('No audio URL in recording');
    }

    const audioData = recording.audioUrl.split(',')[1];
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Use MistralService for transcription
    console.log('[WORKER] Calling Mistral API for transcription...');
    const transcriptionResult = await this.mistralService.transcribeAudio(audioBuffer, settings.mistralApiKey);
    const transcript = transcriptionResult.text;

    // Use MistralService for combined summary and title generation
    console.log('[WORKER] Generating summary and title...');
    let title = 'Audio-Notiz';
    let summary = '';
    try {
      const result = await this.mistralService.generateSummaryAndTitle(
        transcript,
        settings.mistralApiKey,
        settings.summaryTemplate || undefined
      );
      title = result.title;
      summary = result.summary;
    } catch (error) {
      console.warn('[WORKER] Summary and title generation failed, using defaults:', error);
    }

    // Update recording
    await this.storage.updateRecording(recordingId, {
      title,
      transcript,
      summary,
      status: 'transcribed',
    });

    // Only delete audio file if transcription was successful
    // This ensures we can retry failed jobs
    console.log('[WORKER] 🗑️ Deleting audio file from database to save space...');
    await this.storage.updateRecording(recordingId, {
      audioUrl: undefined,
    });
    console.log('[WORKER] ✅ Audio file deleted successfully');

    // Save to GitHub if configured (after successful transcription and cleanup)
    if (settings.githubRepoOwner && settings.githubRepoName) {
      console.log('[WORKER] Saving to GitHub...');
      try {
        await this.githubService.saveRecordingToGitHub({ recordingId, userId });
      } catch (error) {
        console.warn('[WORKER] ⚠️ GitHub save failed, but transcription was successful:', error);
        // Don't throw - transcription was successful, GitHub is optional
      }
    }

    console.log('[WORKER] Transcription completed successfully');
  }

}