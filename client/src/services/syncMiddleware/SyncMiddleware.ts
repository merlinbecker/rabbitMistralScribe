/**
 * SyncMiddleware - Core service class
 * Manages validation chain, request queue, and event-based communication
 */

import type { 
  QueuedRequest, 
  EnqueueOptions, 
  Validator, 
  SyncMiddlewareMetrics,
  IEventBus 
} from './types';
import type { UserSettings } from '@shared/schema';
import { EventBus } from './EventBus';
import { RequestQueue } from './RequestQueue';
import { 
  OnlineValidator, 
  RecordingValidator, 
  AuthValidator, 
  SettingsValidator 
} from './validators';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * SyncMiddleware provides a unified backend communication layer
 * with automatic validation, queueing, and event-based communication
 */
export class SyncMiddleware {
  private eventBus: EventBus;
  private requestQueue: RequestQueue;
  private validators: Validator[];
  private isProcessing: boolean = false;
  private metrics: SyncMiddlewareMetrics;

  constructor(
    private getSettings: () => Promise<UserSettings | null>,
    private isRecording: () => boolean
  ) {
    this.eventBus = new EventBus();
    this.requestQueue = new RequestQueue();

    // Initialize validators in order
    this.validators = [
      new OnlineValidator(),
      new RecordingValidator(isRecording),
      new AuthValidator(this.eventBus),
      new SettingsValidator(getSettings, this.eventBus)
    ];

    this.metrics = {
      requests: {
        total: 0,
        success: 0,
        failed: 0,
        pending: 0
      },
      queue: {
        size: 0,
        processingTime: 0
      },
      validators: {
        authFailures: 0,
        settingsFailures: 0,
        offlineDefers: 0
      }
    };

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for state changes
   */
  private setupEventListeners(): void {
    // Resume processing when online
    window.addEventListener('online', () => {
      this.eventBus.emit('online:changed', { online: true });
      this.processQueue();
    });

    // Pause when offline
    window.addEventListener('offline', () => {
      this.eventBus.emit('online:changed', { online: false });
    });

    // Resume after auth success
    this.eventBus.on('auth:success', () => {
      this.processQueue();
    });

    // Resume after settings update
    this.eventBus.on('settings:updated', () => {
      this.processQueue();
    });
  }

  /**
   * Enqueue a request for processing
   * @param options - Request options
   * @returns Promise that resolves with the response data
   */
  async enqueueRequest<T>(options: EnqueueOptions): Promise<T> {
    const request: QueuedRequest = {
      id: generateRequestId(),
      type: options.type,
      priority: options.priority || 2, // Default to MEDIUM
      payload: options.payload,
      requiresSettings: options.requiresSettings || false,
      requiresAuth: options.requiresAuth ?? true, // Default to true
      retries: 0,
      maxRetries: options.maxRetries || 3,
      timestamp: Date.now(),
      status: 'queued',
      executor: options.executor
    };

    this.metrics.requests.total++;
    this.metrics.requests.pending++;

    this.requestQueue.enqueue(request);
    this.eventBus.emit('request:enqueue', {
      id: request.id,
      type: request.type,
      payload: request.payload
    });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    // Return promise that resolves when request completes
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        this.eventBus.off('request:success', successHandler);
        this.eventBus.off('request:error', errorHandler);
      };

      const successHandler = (data: { id: string; data: T }) => {
        if (data.id === request.id) {
          cleanup();
          this.metrics.requests.success++;
          this.metrics.requests.pending--;
          resolve(data.data);
        }
      };

      const errorHandler = (data: { id: string; error: Error }) => {
        if (data.id === request.id) {
          cleanup();
          this.metrics.requests.failed++;
          this.metrics.requests.pending--;
          reject(data.error);
        }
      };

      this.eventBus.on('request:success', successHandler);
      this.eventBus.on('request:error', errorHandler);
    });
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      while (true) {
        const request = this.requestQueue.dequeue();
        if (!request) break;

        await this.processRequest(request);
      }
    } finally {
      this.isProcessing = false;
      this.updateQueueMetrics();
    }
  }

  /**
   * Process a single request through the validation chain
   * @param request - The request to process
   */
  private async processRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();
    this.eventBus.emit('request:start', { id: request.id });

    // Run validation chain
    for (const validator of this.validators) {
      const result = await validator.validate(request);

      if (!result.valid) {
        // Update metrics based on validator
        if (validator.name === 'AuthValidator') {
          this.metrics.validators.authFailures++;
        } else if (validator.name === 'SettingsValidator') {
          this.metrics.validators.settingsFailures++;
        } else if (validator.name === 'OnlineValidator') {
          this.metrics.validators.offlineDefers++;
        }

        if (result.action === 'defer') {
          // Put back in queue for later
          request.status = 'queued';
          this.requestQueue.enqueue(request);
          this.requestQueue.markComplete(request.id);
          return;
        } else if (result.action === 'wait') {
          // Stop processing, wait for event
          request.status = 'queued';
          this.requestQueue.enqueue(request);
          this.requestQueue.markComplete(request.id);
          this.isProcessing = false;
          return;
        } else if (result.action === 'fail') {
          // Permanent failure
          this.requestQueue.markComplete(request.id);
          this.eventBus.emit('request:error', {
            id: request.id,
            error: new Error(result.reason || 'Validation failed')
          });
          return;
        }
      }
    }

    // All validations passed, execute request
    try {
      const data = await request.executor();
      const processingTime = Date.now() - startTime;
      
      // Update average processing time
      this.metrics.queue.processingTime = 
        (this.metrics.queue.processingTime + processingTime) / 2;

      this.requestQueue.markComplete(request.id);
      this.eventBus.emit('request:success', { id: request.id, data });
    } catch (error) {
      if (request.retries < request.maxRetries) {
        // Retry with exponential backoff
        request.retries++;
        const delay = Math.pow(2, request.retries) * 1000;
        
        setTimeout(() => {
          request.status = 'queued';
          this.requestQueue.enqueue(request);
          this.processQueue();
        }, delay);
        
        this.requestQueue.markComplete(request.id);
      } else {
        // Max retries exceeded
        this.requestQueue.markComplete(request.id);
        this.eventBus.emit('request:error', {
          id: request.id,
          error: error instanceof Error ? error : new Error('Unknown error')
        });
      }
    }
  }

  /**
   * Update queue metrics
   */
  private updateQueueMetrics(): void {
    const status = this.requestQueue.getStatus();
    this.metrics.queue.size = status.total;
  }

  /**
   * Get the EventBus instance
   */
  getEventBus(): IEventBus {
    return this.eventBus;
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return this.requestQueue.getStatus();
  }

  /**
   * Get metrics
   */
  getMetrics(): SyncMiddlewareMetrics {
    this.updateQueueMetrics();
    return { ...this.metrics };
  }

  /**
   * Clear the queue and reset
   */
  clear(): void {
    this.requestQueue.clear();
    this.isProcessing = false;
  }
}
