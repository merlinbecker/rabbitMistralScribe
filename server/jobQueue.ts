import type { DatabaseService } from "./databaseService";

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
  private readonly QUEUE_PREFIX = 'job:transcription:';
  private readonly MAX_ATTEMPTS = 3;
  private db: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
  }

  // Add job to queue
  async enqueue(recordingId: string, userId: string): Promise<string> {
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

    await this.db.set(`${this.QUEUE_PREFIX}${jobId}`, job);

    console.log('[JOBQUEUE] ✅ Job saved to database');
    console.log('[JOBQUEUE] Database key:', `${this.QUEUE_PREFIX}${jobId}`);
    console.log('[JOBQUEUE] ========================================');

    return jobId;
  }

  // Get next pending job
  async dequeue(): Promise<TranscriptionJob | null> {
    const keys = await this.db.list(this.QUEUE_PREFIX);
    console.log('[QUEUE] Keys found:', keys);

    for (const key of keys) {
      console.log('[QUEUE] Fetching job data for key:', key);
      const job = await this.db.get<TranscriptionJob>(key);

      if (!job) {
        console.log('[QUEUE] No data found for key:', key);
        continue;
      }

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
      await this.db.set(key, job);

      console.log('[QUEUE] Job dequeued:', job.id, 'attempt:', job.attempts);
      return job;
    }

    return null;
  }

  // Mark job as completed
  async markCompleted(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const job = await this.db.get<TranscriptionJob>(key);
    if (!job) return;

    job.status = 'completed';
    job.processedAt = new Date().toISOString();

    await this.db.set(key, job);
    console.log('[QUEUE] Job completed:', jobId);

    // Cleanup after 1 hour
    setTimeout(() => this.cleanup(jobId), 60 * 60 * 1000);
  }

  // Mark job as failed
  async markFailed(jobId: string, error: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const job = await this.db.get<TranscriptionJob>(key);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
    job.processedAt = new Date().toISOString();

    await this.db.set(key, job);
    console.error('[QUEUE] Job failed:', jobId, error);
  }

  // Requeue job (set back to pending)
  async requeue(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    const job = await this.db.get<TranscriptionJob>(key);
    if (!job) return;

    job.status = 'pending';

    await this.db.set(key, job);
    console.log('[QUEUE] Job requeued:', jobId);
  }

  // Cleanup completed job
  async cleanup(jobId: string): Promise<void> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    await this.db.delete(key);
    console.log('[QUEUE] Job cleaned up:', jobId);
  }

  // Get job status
  async getJob(jobId: string): Promise<TranscriptionJob | null> {
    const key = `${this.QUEUE_PREFIX}${jobId}`;
    return this.db.get<TranscriptionJob>(key) || null;
  }

  // Get pending jobs count
  async getPendingCount(): Promise<number> {
    const keys = await this.db.list(this.QUEUE_PREFIX);
    let count = 0;

    for (const key of keys) {
      const job = await this.db.get<TranscriptionJob>(key);
      if (job && job.status === 'pending') count++;
    }

    return count;
  }
}