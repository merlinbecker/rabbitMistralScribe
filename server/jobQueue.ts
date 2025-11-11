import Database from "@replit/database";

const db = new Database();

export interface TranscriptionJob {
  id: string;
  recordingId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

export class JobQueue {
  private static readonly QUEUE_PREFIX = 'job:transcription:';
  private static readonly MAX_ATTEMPTS = 3;

  // Add job to queue
  static async enqueue(recordingId: string, userId: string): Promise<string> {
    console.log('[JOBQUEUE] ========================================');
    console.log('[JOBQUEUE] enqueue() called');
    console.log('[JOBQUEUE] Recording ID:', recordingId);
    console.log('[JOBQUEUE] User ID:', userId);
    console.log('[JOBQUEUE] ========================================');

    const jobId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const job: TranscriptionJob = {
      id: jobId,
      recordingId,
      userId,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    console.log('[JOBQUEUE] 🔄 Saving job to database...');
    console.log('[JOBQUEUE] Job details:', job);

    await db.set(`job:transcription:${jobId}`, JSON.stringify(job));

    console.log('[JOBQUEUE] ✅ Job saved to database');
    console.log('[JOBQUEUE] Database key:', `job:transcription:${jobId}`);
    console.log('[JOBQUEUE] ========================================');

    return jobId;
  }

  // Get next pending job
  static async dequeue(): Promise<TranscriptionJob | null> {
    const keysResponse = await db.list(this.QUEUE_PREFIX);
    
    // Unwrap Replit DB response
    let keys: string[] = [];
    if (keysResponse && typeof keysResponse === 'object' && 'ok' in keysResponse && 'value' in keysResponse) {
      keys = keysResponse.value || [];
    } else if (Array.isArray(keysResponse)) {
      keys = keysResponse;
    }

    for (const key of keys) {
      const rawData = await db.get(key);

      if (!rawData) continue;

      const job = JSON.parse(rawData as string) as TranscriptionJob;

      // Skip jobs that are already processing or completed
      if (job.status !== 'pending') continue;

      // Skip jobs that exceeded max attempts
      if (job.attempts >= this.MAX_ATTEMPTS) {
        await this.markFailed(job.id, 'Max attempts exceeded');
        continue;
      }

      // Mark as processing
      job.status = 'processing';
      job.attempts++;
      await db.set(key, JSON.stringify(job));

      console.log('[QUEUE] Job dequeued:', job.id, 'attempt:', job.attempts);
      return job;
    }

    return null;
  }

  // Mark job as completed
  static async markCompleted(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const rawData = await db.get(key);

    if (!rawData) return;

    const job = JSON.parse(rawData as string) as TranscriptionJob;
    job.status = 'completed';
    job.processedAt = new Date().toISOString();

    await db.set(key, JSON.stringify(job));
    console.log('[QUEUE] Job completed:', jobId);

    // Cleanup after 1 hour
    setTimeout(() => this.cleanup(jobId), 60 * 60 * 1000);
  }

  // Mark job as failed
  static async markFailed(jobId: string, error: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const rawData = await db.get(key);

    if (!rawData) return;

    const job = JSON.parse(rawData as string) as TranscriptionJob;
    job.status = 'failed';
    job.error = error;
    job.processedAt = new Date().toISOString();

    await db.set(key, JSON.stringify(job));
    console.error('[QUEUE] Job failed:', jobId, error);
  }

  // Requeue job (set back to pending)
  static async requeue(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const rawData = await db.get(key);

    if (!rawData) return;

    const job = JSON.parse(rawData as string) as TranscriptionJob;
    job.status = 'pending';

    await db.set(key, JSON.stringify(job));
    console.log('[QUEUE] Job requeued:', jobId);
  }

  // Cleanup completed job
  static async cleanup(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    await db.delete(key);
    console.log('[QUEUE] Job cleaned up:', jobId);
  }

  // Get job status
  static async getJob(jobId: string): Promise<TranscriptionJob | null> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const rawData = await db.get(key);

    if (!rawData) return null;

    return JSON.parse(rawData as string) as TranscriptionJob;
  }

  // Get pending jobs count
  static async getPendingCount(): Promise<number> {
    const keysResponse = await db.list(this.QUEUE_PREFIX);
    
    // Unwrap Replit DB response
    let keys: string[] = [];
    if (keysResponse && typeof keysResponse === 'object' && 'ok' in keysResponse && 'value' in keysResponse) {
      keys = keysResponse.value || [];
    } else if (Array.isArray(keysResponse)) {
      keys = keysResponse;
    }
    
    let count = 0;

    for (const key of keys) {
      const rawData = await db.get(key);
      if (!rawData) continue;

      const job = JSON.parse(rawData as string) as TranscriptionJob;
      if (job.status === 'pending') count++;
    }

    return count;
  }
}