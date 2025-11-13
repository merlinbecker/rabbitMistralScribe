import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import type { UserSettings } from '@shared/schema';

/**
 * Hook to check if Mistral API key is configured and redirect to settings if not
 * @param skipRedirect - If true, only returns the status without redirecting
 * @returns Object with isLoading and hasApiKey status
 */
export function useRequireApiKey(skipRedirect = false) {
  const [location, setLocation] = useLocation();
  
  const { data: settings, isLoading, error } = useQuery<UserSettings>({
    queryKey: ['/api/settings'],
    retry: 2,
    staleTime: 30000, // 30 seconds
  });

  const hasApiKey = !!settings?.mistralApiKey;

  useEffect(() => {
    // Only redirect if:
    // 1. Not already on settings page
    // 2. Settings are loaded (not loading)
    // 3. API key is missing
    // 4. No error occurred
    // 5. skipRedirect is false
    if (!skipRedirect && !isLoading && !error && !hasApiKey && location !== '/settings') {
      console.log('[useRequireApiKey] No Mistral API key found - redirecting to settings');
      setLocation('/settings');
    }
  }, [hasApiKey, isLoading, error, location, setLocation, skipRedirect]);

  return {
    isLoading,
    hasApiKey,
    settings,
  };
}
