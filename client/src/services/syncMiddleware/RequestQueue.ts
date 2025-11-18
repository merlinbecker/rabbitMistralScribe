/**
 * RequestQueue - Priority-based request queue with retry logic
 * Manages queued requests and ensures ordered execution
 */

import type { QueuedRequest, QueueStatus } from './types';

/**
 * RequestQueue manages a priority-based queue of requests
 * Supports concurrent processing limits and request deduplication
 */
export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private maxConcurrent = 3;
  private processing = 0;
  private pendingRequests = new Map<string, QueuedRequest>();

  /**
   * Add a request to the queue
   * Inserts by priority (lower number = higher priority)
   * Performs deduplication based on type and payload
   * @param request - The request to enqueue
   */
  enqueue(request: QueuedRequest): void {
    // Check for duplicate requests
    const dedupKey = this.getDedupKey(request);

    if (this.pendingRequests.has(dedupKey)) {
      console.log('[RequestQueue] Duplicate request detected, skipping:', dedupKey);
      return;
    }

    this.pendingRequests.set(dedupKey, request);

    // Insert by priority (lower number = higher priority)
    const insertIndex = this.queue.findIndex(
      r => r.priority > request.priority
    );

    if (insertIndex === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(insertIndex, 0, request);
    }
  }

  /**
   * Remove and return the next request from the queue
   * Respects the maxConcurrent limit
   * @returns Next request or null if queue is empty or limit reached
   */
  dequeue(): QueuedRequest | null {
    if (this.processing >= this.maxConcurrent) {
      return null;
    }

    const request = this.queue.shift();
    if (request) {
      this.processing++;
      request.status = 'processing';
    }
    return request || null;
  }

  /**
   * Mark a request as complete and remove from pending
   * @param requestId - ID of the completed request
   */
  markComplete(requestId: string): void {
    this.processing = Math.max(0, this.processing - 1);
    
    // Remove from pending requests
    for (const [key, request] of this.pendingRequests.entries()) {
      if (request.id === requestId) {
        this.pendingRequests.delete(key);
        break;
      }
    }
  }

  /**
   * Get current queue status
   * @returns Status object with queue metrics
   */
  getStatus(): QueueStatus {
    return {
      queued: this.queue.length,
      processing: this.processing,
      total: this.queue.length + this.processing
    };
  }

  /**
   * Clear the queue and reset processing count
   */
  clear(): void {
    this.queue = [];
    this.processing = 0;
    this.pendingRequests.clear();
  }

  /**
   * Get the size of the queue
   * @returns Number of queued requests
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if the queue is empty
   * @returns True if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Generate a deduplication key for a request
   * @param request - The request
   * @returns Deduplication key
   */
  private getDedupKey(request: QueuedRequest): string {
    try {
      return `${request.type}:${JSON.stringify(request.payload)}`;
    } catch (error) {
      // If payload can't be stringified, use type and timestamp
      return `${request.type}:${request.timestamp}`;
    }
  }

  /**
   * Set the maximum number of concurrent requests
   * @param max - Maximum concurrent requests
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
  }

  /**
   * Get all queued requests (for debugging)
   * @returns Array of queued requests
   */
  getQueuedRequests(): QueuedRequest[] {
    return [...this.queue];
  }
}
