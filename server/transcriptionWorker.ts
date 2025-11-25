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
      return;
    }

    this.isRunning = true;
    console.log('[WORKER] ✅ Started successfully');
  }

  stop(): void {
    console.log('[WORKER] 🛑 Stopping worker...');
    this.isRunning = false;
    console.log('[WORKER] ✅ Stopped');
  }

  getStatus(): boolean {
    return this.isRunning;
  }

  async notifyNewJob(): Promise<void> {
    if (!this.isRunning) return;
    if (this.isProcessing) return;

    const pendingCount = await this.jobQueue.getPendingCount();
    if (pendingCount === 0) return;

    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;
    try {
      while (this.isRunning) {
        const job = await this.jobQueue.dequeue();
        if (!job) break;

        try {
          await this.transcribeRecording(job.recordingId, job.userId);
          await this.jobQueue.markCompleted(job.id);
        } catch (error) {
          console.error(`[WORKER] ❌ Job failed: ${job.id}`, error);
          if (job.attempts < 3) {
            await this.jobQueue.requeue(job.id);
          } else {
            await this.jobQueue.markFailed(job.id, error instanceof Error ? error.message : 'Unknown error');
            await this.storage.updateRecording(job.recordingId, { status: 'failed' });
          }
        }
      }
    } catch (error) {
      console.error('[WORKER] ❌ Critical error in processQueue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async transcribeRecording(recordingId: string, userId: string): Promise<void> {
    console.log(`[WORKER] 🎯 Transcribing recording ${recordingId} for user ${userId}`);

    const recording = await this.storage.getRecording(recordingId);
    if (!recording) throw new Error('Recording not found');

    // Get audio from in-memory storage
    const audioData = await this.storage.getAudio(recordingId);
    if (!audioData) throw new Error('Audio data not found in memory');

    const settings = await this.storage.getUserSettings(userId);
    if (!settings?.mistralApiKey) throw new Error('No Mistral API key configured');

    await this.storage.updateRecording(recordingId, { status: 'transcribing' });

    const audioBuffer = Buffer.from(audioData, 'base64');

    const transcriptionResult = await this.mistralService.transcribeAudio(audioBuffer, settings.mistralApiKey);
    const transcript = transcriptionResult.text;

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
      console.warn('[WORKER] Summary generation failed, using defaults', error);
    }

    await this.storage.updateRecording(recordingId, {
      title,
      transcript,
      summary,
      status: 'transcribed',
    });

    // Delete audio from memory after successful transcription
    await this.storage.deleteAudio(recordingId);
    console.log(`[WORKER] 🗑️ Audio data for ${recordingId} deleted from memory`);

    // Save to GitHub and clear text data if successful
    if (settings.githubRepoOwner && settings.githubRepoName) {
      try {
        await this.githubService.saveRecordingToGitHub({ recordingId, userId });

        // Clear transcript and summary as requested
        await this.storage.updateRecording(recordingId, {
          transcript: undefined,
          summary: undefined
        });
        console.log('[WORKER] ✅ Saved to GitHub and cleared data');
      } catch (error) {
        console.warn('[WORKER] ⚠️ GitHub save failed:', error);
      }
    }
  }
}