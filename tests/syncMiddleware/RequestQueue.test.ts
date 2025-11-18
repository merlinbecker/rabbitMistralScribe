/**
 * RequestQueue Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestQueue } from '@/services/syncMiddleware/RequestQueue';
import { RequestPriority } from '@/services/syncMiddleware/types';
import type { QueuedRequest } from '@/services/syncMiddleware/types';

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue();
  });

  const createMockRequest = (priority: RequestPriority, id: string): QueuedRequest => ({
    id,
    type: 'test',
    priority,
    payload: { test: id },
    retries: 0,
    maxRetries: 3,
    timestamp: Date.now(),
    status: 'queued',
    executor: vi.fn()
  });

  describe('enqueue()', () => {
    it('should add request to queue', () => {
      const request = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      queue.enqueue(request);

      expect(queue.size()).toBe(1);
      expect(queue.isEmpty()).toBe(false);
    });

    it('should prioritize requests by priority', () => {
      const lowPriority = createMockRequest(RequestPriority.LOW, 'low');
      const highPriority = createMockRequest(RequestPriority.HIGH, 'high');
      const mediumPriority = createMockRequest(RequestPriority.MEDIUM, 'medium');

      queue.enqueue(lowPriority);
      queue.enqueue(highPriority);
      queue.enqueue(mediumPriority);

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue();

      expect(first?.id).toBe('high');
      expect(second?.id).toBe('medium');
      expect(third?.id).toBe('low');
    });

    it('should deduplicate identical requests', () => {
      const request1 = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      const request2 = createMockRequest(RequestPriority.MEDIUM, 'req-2');
      // Same type and payload
      request2.payload = request1.payload;

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      queue.enqueue(request1);
      queue.enqueue(request2); // Should be deduplicated

      expect(queue.size()).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate request detected'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('dequeue()', () => {
    it('should return null when queue is empty', () => {
      expect(queue.dequeue()).toBeNull();
    });

    it('should return and remove first request', () => {
      const request = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      queue.enqueue(request);

      const dequeued = queue.dequeue();

      expect(dequeued?.id).toBe('req-1');
      expect(queue.isEmpty()).toBe(true);
    });

    it('should respect maxConcurrent limit', () => {
      queue.setMaxConcurrent(2);

      const req1 = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      const req2 = createMockRequest(RequestPriority.MEDIUM, 'req-2');
      const req3 = createMockRequest(RequestPriority.MEDIUM, 'req-3');

      queue.enqueue(req1);
      queue.enqueue(req2);
      queue.enqueue(req3);

      const first = queue.dequeue();
      const second = queue.dequeue();
      const third = queue.dequeue(); // Should be null due to limit

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(third).toBeNull();
    });

    it('should update request status to processing', () => {
      const request = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      queue.enqueue(request);

      const dequeued = queue.dequeue();

      expect(dequeued?.status).toBe('processing');
    });
  });

  describe('markComplete()', () => {
    it('should decrement processing count', () => {
      const request = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      queue.enqueue(request);

      queue.dequeue();
      const statusBefore = queue.getStatus();
      expect(statusBefore.processing).toBe(1);

      queue.markComplete('req-1');
      const statusAfter = queue.getStatus();
      expect(statusAfter.processing).toBe(0);
    });

    it('should not go below 0', () => {
      queue.markComplete('nonexistent');
      const status = queue.getStatus();
      expect(status.processing).toBe(0);
    });
  });

  describe('getStatus()', () => {
    it('should return correct status', () => {
      const req1 = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      const req2 = createMockRequest(RequestPriority.MEDIUM, 'req-2');
      const req3 = createMockRequest(RequestPriority.MEDIUM, 'req-3');

      queue.enqueue(req1);
      queue.enqueue(req2);
      queue.enqueue(req3);

      queue.dequeue(); // One processing

      const status = queue.getStatus();
      expect(status.queued).toBe(2);
      expect(status.processing).toBe(1);
      expect(status.total).toBe(3);
    });
  });

  describe('clear()', () => {
    it('should clear queue and reset processing', () => {
      const req1 = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      const req2 = createMockRequest(RequestPriority.MEDIUM, 'req-2');

      queue.enqueue(req1);
      queue.enqueue(req2);
      queue.dequeue();

      queue.clear();

      const status = queue.getStatus();
      expect(status.queued).toBe(0);
      expect(status.processing).toBe(0);
      expect(status.total).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('size() and isEmpty()', () => {
    it('should return correct size', () => {
      expect(queue.size()).toBe(0);

      queue.enqueue(createMockRequest(RequestPriority.MEDIUM, 'req-1'));
      expect(queue.size()).toBe(1);

      queue.enqueue(createMockRequest(RequestPriority.MEDIUM, 'req-2'));
      expect(queue.size()).toBe(2);
    });

    it('should return correct isEmpty status', () => {
      expect(queue.isEmpty()).toBe(true);

      queue.enqueue(createMockRequest(RequestPriority.MEDIUM, 'req-1'));
      expect(queue.isEmpty()).toBe(false);

      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('setMaxConcurrent()', () => {
    it('should update max concurrent limit', () => {
      queue.setMaxConcurrent(5);

      for (let i = 0; i < 6; i++) {
        queue.enqueue(createMockRequest(RequestPriority.MEDIUM, `req-${i}`));
      }

      // Should be able to dequeue 5 requests
      for (let i = 0; i < 5; i++) {
        expect(queue.dequeue()).not.toBeNull();
      }
      expect(queue.dequeue()).toBeNull();
    });

    it('should enforce minimum of 1', () => {
      queue.setMaxConcurrent(0);
      queue.enqueue(createMockRequest(RequestPriority.MEDIUM, 'req-1'));

      expect(queue.dequeue()).not.toBeNull();
    });
  });

  describe('getQueuedRequests()', () => {
    it('should return copy of queued requests', () => {
      const req1 = createMockRequest(RequestPriority.MEDIUM, 'req-1');
      const req2 = createMockRequest(RequestPriority.MEDIUM, 'req-2');

      queue.enqueue(req1);
      queue.enqueue(req2);

      const requests = queue.getQueuedRequests();
      expect(requests).toHaveLength(2);
      expect(requests[0].id).toBe('req-1');
      expect(requests[1].id).toBe('req-2');

      // Should be a copy
      requests.push(createMockRequest(RequestPriority.MEDIUM, 'req-3'));
      expect(queue.size()).toBe(2);
    });
  });
});
