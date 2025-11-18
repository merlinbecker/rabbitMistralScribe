/**
 * SyncMiddleware Type Definitions
 * Defines all types, interfaces and enums for the SyncMiddleware system
 */

import type { QueryKey, QueryFunction, UseQueryOptions, UseMutationOptions, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { UserSettings } from '@shared/schema';

// ==================== Request Priority ====================

/**
 * Priority levels for requests in the queue
 * Lower number = higher priority
 */
export enum RequestPriority {
  HIGH = 1,    // Upload, Settings Update
  MEDIUM = 2,  // Fetch Settings, Recordings
  LOW = 3      // Background Sync
}

// ==================== Request Types ====================

export type RequestType = 
  | 'upload'
  | 'settings:update'
  | 'settings:fetch'
  | 'recordings:fetch'
  | 'github:export'
  | 'sync'
  | string; // Allow custom types

// ==================== Event System ====================

/**
 * Type-safe event definitions for the EventBus
 */
export type SyncEvents = {
  // Request Events
  'request:enqueue': { id: string; type: RequestType; payload: any };
  'request:start': { id: string };
  'request:success': { id: string; data: any };
  'request:error': { id: string; error: Error };
  
  // Auth Events
  'auth:required': { requestId: string };
  'auth:success': { userId: string };
  'auth:failed': { error: string };
  
  // Settings Events
  'settings:required': { requestId: string; missing: string[] };
  'settings:updated': { settings: UserSettings };
  
  // State Events
  'online:changed': { online: boolean };
  'recording:changed': { recording: boolean };
};

// ==================== Validation ====================

/**
 * Result of a validation check
 */
export interface ValidationResult {
  valid: boolean;
  action?: 'defer' | 'wait' | 'fail';
  reason?: string;
}

/**
 * Interface for validators in the validation chain
 */
export interface Validator {
  name: string;
  validate(request: QueuedRequest): Promise<ValidationResult>;
}

// ==================== Queue ====================

/**
 * Status of a request in the queue
 */
export type RequestStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * A request in the queue
 */
export interface QueuedRequest {
  id: string;
  type: RequestType;
  priority: RequestPriority;
  payload: any;
  retries: number;
  maxRetries: number;
  timestamp: number;
  status: RequestStatus;
  requiresSettings?: boolean;
  requiresAuth?: boolean;
  executor: () => Promise<any>;
}

/**
 * Options for enqueueing a request
 */
export interface EnqueueOptions {
  type: RequestType;
  priority?: RequestPriority;
  payload?: any;
  requiresSettings?: boolean;
  requiresAuth?: boolean;
  maxRetries?: number;
  executor: () => Promise<any>;
}

/**
 * Queue status information
 */
export interface QueueStatus {
  queued: number;
  processing: number;
  total: number;
}

// ==================== React Hooks ====================

/**
 * Options for useSyncQuery hook
 */
export interface SyncQueryOptions<TData = unknown> {
  requiresAuth?: boolean;
  requiresSettings?: boolean;
  priority?: RequestPriority;
  enabled?: boolean;
  queryOptions?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>;
}

/**
 * Options for useSyncMutation hook
 */
export interface SyncMutationOptions<TData = unknown, TVariables = unknown> {
  type: RequestType;
  priority?: RequestPriority;
  requiresSettings?: boolean;
  requiresAuth?: boolean;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
  mutationOptions?: Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'>;
}

/**
 * Options for useSyncRequest hook
 */
export interface SyncRequestOptions {
  priority?: RequestPriority;
  requiresSettings?: boolean;
  requiresAuth?: boolean;
}

// ==================== Metrics ====================

/**
 * Metrics collected by SyncMiddleware
 */
export interface SyncMiddlewareMetrics {
  requests: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  queue: {
    size: number;
    processingTime: number; // avg ms
  };
  validators: {
    authFailures: number;
    settingsFailures: number;
    offlineDefers: number;
  };
}

// ==================== EventBus Interface ====================

export interface IEventBus {
  on<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): () => void;
  emit<K extends keyof SyncEvents>(event: K, data: SyncEvents[K]): void;
  off<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): void;
  once<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): void;
  clear(): void;
}
