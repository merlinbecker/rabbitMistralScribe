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
    console.log('[JOBQUEUE] 📝 enqueue() called');
    console.log('[JOBQUEUE] Recording ID:', recordingId);
    console.log('[JOBQUEUE] User ID:', userId);
    console.log('[JOBQUEUE] Timestamp:', new Date().toISOString());
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
    console.log('[JOBQUEUE] Job details:', JSON.stringify(job, null, 2));

    await this.db.set(`${this.QUEUE_PREFIX}${jobId}`, job);

    // Verify job was saved
    const savedJob = await this.db.get<TranscriptionJob>(`${this.QUEUE_PREFIX}${jobId}`);
    if (savedJob) {
      console.log('[JOBQUEUE] ✅ Job saved and verified in database');
    } else {
      console.error('[JOBQUEUE] ⚠️ WARNING: Job save verification failed!');
    }

    console.log('[JOBQUEUE] Database key:', `${this.QUEUE_PREFIX}${jobId}`);
    
    // Get current queue size
    const pendingCount = await this.getPendingCount();
    console.log('[JOBQUEUE] 📊 Current queue size:', pendingCount, 'pending job(s)');
    console.log('[JOBQUEUE] ========================================');

    return jobId;
  }

  // Get next pending job
  async dequeue(): Promise<TranscriptionJob | null> {
    const keys = await this.db.list(this.QUEUE_PREFIX);
    console.log('[JOBQUEUE] 🔍 Searching for pending jobs...');
    console.log('[JOBQUEUE] Total keys found:', keys.length);

    let pendingCount = 0;
    let processingCount = 0;
    let completedCount = 0;
    let failedCount = 0;

    for (const key of keys) {
      const job = await this.db.get<TranscriptionJob>(key);

      if (!job) {
        console.log('[JOBQUEUE] ⚠️ No data found for key:', key);
        continue;
      }

      // Count job statuses
      if (job.status === 'pending') pendingCount++;
      else if (job.status === 'processing') processingCount++;
      else if (job.status === 'completed') completedCount++;
      else if (job.status === 'failed') failedCount++;

      // Skip jobs that are already processing or completed
      if (job.status !== 'pending') {
        console.log(`[JOBQUEUE] Skipping job ${job.id} with status: ${job.status}`);
        continue;
      }

      // Skip jobs that exceeded max attempts
      if (job.attempts >= this.MAX_ATTEMPTS) {
        console.log(`[JOBQUEUE] Job ${job.id} exceeded max attempts - marking as failed`);
        await this.markFailed(job.id, 'Max attempts exceeded');
        continue;
      }

      // Mark as processing
      job.status = 'processing';
      job.attempts++;
      await this.db.set(key, job);

      console.log('[JOBQUEUE] ✅ Job dequeued:', {
        id: job.id,
        recordingId: job.recordingId,
        attempt: job.attempts,
        maxAttempts: this.MAX_ATTEMPTS
      });
      
      return job;
    }

    console.log('[JOBQUEUE] 📊 Queue summary:', {
      pending: pendingCount,
      processing: processingCount,
      completed: completedCount,
      failed: failedCount,
      total: keys.length
    });

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
    const job = await this.db.get<TranscriptionJob>(key);
    return job || null;
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