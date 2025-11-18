/**
 * useSyncRequest - React hook for SyncMiddleware requests
 * Provides a simplified interface for making backend requests
 */

import { useState, useCallback } from 'react';
import { useSyncMiddleware } from '@/contexts/SyncMiddlewareContext';
import type { RequestType, RequestPriority, SyncRequestOptions } from '@/services/syncMiddleware/types';
import { apiRequest } from '@/lib/queryClient';

interface UseSyncRequestResult<TData = unknown, TPayload = unknown> {
  execute: (payload: TPayload, customExecutor?: () => Promise<TData>) => Promise<TData>;
  executeAsync: (payload: TPayload, customExecutor?: () => Promise<TData>) => Promise<TData>;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  data: TData | null;
  error: Error | null;
  reset: () => void;
}

/**
 * Hook for making backend requests through SyncMiddleware
 * Provides loading states and error handling
 * 
 * @param type - Request type identifier
 * @param options - Request options (priority, auth, settings)
 * @returns Request control object
 * 
 * @example
 * ```tsx
 * const { execute, isLoading } = useSyncRequest('upload', {
 *   priority: RequestPriority.HIGH,
 *   requiresSettings: true
 * });
 * 
 * await execute({ audioBlob, recordingId });
 * ```
 */
export function useSyncRequest<TData = unknown, TPayload = unknown>(
  type: RequestType,
  options?: SyncRequestOptions
): UseSyncRequestResult<TData, TPayload> {
  const { syncMiddleware } = useSyncMiddleware();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setIsSuccess(false);
    setIsError(false);
    setData(null);
    setError(null);
  }, []);

  const execute = useCallback(
    async (payload: TPayload, customExecutor?: () => Promise<TData>): Promise<TData> => {
      setIsLoading(true);
      setIsError(false);
      setError(null);

      try {
        const result = await syncMiddleware.enqueueRequest<TData>({
          type,
          priority: options?.priority,
          payload,
          requiresSettings: options?.requiresSettings,
          requiresAuth: options?.requiresAuth,
          executor: customExecutor || (async () => {
            // Default implementation - makes POST request
            const response = await apiRequest('POST', `/api/${type}`, payload);
            return response as TData;
          }),
        });

        setData(result);
        setIsSuccess(true);
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setIsError(true);
        setIsLoading(false);
        throw error;
      }
    },
    [syncMiddleware, type, options]
  );

  return {
    execute,
    executeAsync: execute, // Alias for compatibility
    isLoading,
    isSuccess,
    isError,
    data,
    error,
    reset,
  };
}
