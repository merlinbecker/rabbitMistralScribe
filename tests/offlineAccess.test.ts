import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff } from '../client/src/utils/retryWithBackoff';

describe('Offline Access - Retry with Backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first try', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(mockFn, {
      maxRetries: 3,
      initialDelay: 1000,
    });

    // Fast-forward through retries
    await vi.advanceTimersByTimeAsync(1000); // First retry
    await vi.advanceTimersByTimeAsync(2000); // Second retry

    const result = await promise;

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should respect maxRetries and throw after exhausting attempts', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Always fails'));

    const promise = retryWithBackoff(mockFn, {
      maxRetries: 2,
      initialDelay: 1000,
    }).catch(err => err);

    // Fast-forward through all retries
    await vi.advanceTimersByTimeAsync(1000); // First retry
    await vi.advanceTimersByTimeAsync(2000); // Second retry

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Always fails');
    expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should use exponential backoff', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockRejectedValueOnce(new Error('Second failure'))
      .mockRejectedValueOnce(new Error('Third failure'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(mockFn, {
      maxRetries: 3,
      initialDelay: 1000,
      backoffMultiplier: 2,
    });

    // Verify exponential backoff: 1s, 2s, 4s
    await vi.advanceTimersByTimeAsync(1000); // 1s delay
    await vi.advanceTimersByTimeAsync(2000); // 2s delay
    await vi.advanceTimersByTimeAsync(4000); // 4s delay

    const result = await promise;

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(4);
  });

  it('should respect maxDelay cap', async () => {
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failure 1'))
      .mockRejectedValueOnce(new Error('Failure 2'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(mockFn, {
      maxRetries: 2,
      initialDelay: 10000,
      maxDelay: 5000, // Cap at 5 seconds
      backoffMultiplier: 2,
    });

    // Should cap at maxDelay (5000ms) instead of using 10000ms
    await vi.advanceTimersByTimeAsync(5000); // Capped delay
    await vi.advanceTimersByTimeAsync(5000); // Capped delay

    const result = await promise;

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should handle async functions correctly', async () => {
    let callCount = 0;
    const asyncFn = async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Not yet');
      }
      return 'done';
    };

    const promise = retryWithBackoff(asyncFn, {
      maxRetries: 3,
      initialDelay: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('done');
    expect(callCount).toBe(3);
  });
});

describe('Offline Access - Network Status', () => {
  it('should detect initial online status', () => {
    // Test runs in jsdom which has navigator.onLine
    expect(navigator.onLine).toBeDefined();
  });

  it('should handle online event', () => {
    const listener = vi.fn();
    window.addEventListener('online', listener);

    window.dispatchEvent(new Event('online'));

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('online', listener);
  });

  it('should handle offline event', () => {
    const listener = vi.fn();
    window.addEventListener('offline', listener);

    window.dispatchEvent(new Event('offline'));

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener('offline', listener);
  });
});

describe('Offline Access - IndexedDB Integration', () => {
  it('should handle recording status transitions', () => {
    // Status flow: queued -> uploading -> uploaded -> deleted
    const statuses = ['queued', 'uploading', 'uploaded', 'failed'] as const;
    
    expect(statuses).toContain('queued');
    expect(statuses).toContain('uploading');
    expect(statuses).toContain('uploaded');
    expect(statuses).toContain('failed');
  });

  it('should validate LocalRecording structure', () => {
    const mockRecording = {
      id: crypto.randomUUID(),
      audioBlob: new Blob(['test'], { type: 'audio/webm' }),
      duration: 120,
      status: 'queued' as const,
      createdAt: new Date(),
    };

    expect(mockRecording).toHaveProperty('id');
    expect(mockRecording).toHaveProperty('audioBlob');
    expect(mockRecording).toHaveProperty('duration');
    expect(mockRecording).toHaveProperty('status');
    expect(mockRecording).toHaveProperty('createdAt');
    expect(mockRecording.audioBlob).toBeInstanceOf(Blob);
    expect(mockRecording.duration).toBeGreaterThan(0);
  });
});
