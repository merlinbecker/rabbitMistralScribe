/**
 * SyncMiddlewareContext - React Context for SyncMiddleware
 * Provides SyncMiddleware instance to all components
 */

import React, { createContext, useContext, ReactNode, useMemo, useState } from 'react';
import { SyncMiddleware } from '@/services/syncMiddleware';
import type { UserSettings } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';

interface SyncMiddlewareContextValue {
  syncMiddleware: SyncMiddleware;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
}

const SyncMiddlewareContext = createContext<SyncMiddlewareContextValue | null>(null);

interface SyncMiddlewareProviderProps {
  children: ReactNode;
}

/**
 * Provider for SyncMiddleware
 * Initializes SyncMiddleware with required dependencies
 */
export function SyncMiddlewareProvider({ children }: SyncMiddlewareProviderProps) {
  const [isRecording, setIsRecording] = useState(false);

  // Create SyncMiddleware instance with dependency injection
  const syncMiddleware = useMemo(() => {
    const getSettings = async (): Promise<UserSettings | null> => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return null;
        return await response.json();
      } catch (error) {
        console.error('[SyncMiddleware] Failed to fetch settings:', error);
        return null;
      }
    };

    const getIsRecording = () => isRecording;

    return new SyncMiddleware(getSettings, getIsRecording);
  }, [isRecording]);

  const value = useMemo(
    () => ({
      syncMiddleware,
      isRecording,
      setIsRecording,
    }),
    [syncMiddleware, isRecording]
  );

  return (
    <SyncMiddlewareContext.Provider value={value}>
      {children}
    </SyncMiddlewareContext.Provider>
  );
}

/**
 * Hook to access SyncMiddleware from context
 * @throws Error if used outside of SyncMiddlewareProvider
 */
export function useSyncMiddleware(): SyncMiddlewareContextValue {
  const context = useContext(SyncMiddlewareContext);
  
  if (!context) {
    throw new Error('useSyncMiddleware must be used within SyncMiddlewareProvider');
  }
  
  return context;
}
