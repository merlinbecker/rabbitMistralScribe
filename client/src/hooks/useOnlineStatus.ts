import { useState, useEffect } from 'react';

/**
 * Custom hook to track online/offline status
 * Provides real-time updates when network connectivity changes
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => {
      console.log('[NETWORK] Connection restored');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[NETWORK] Connection lost');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
