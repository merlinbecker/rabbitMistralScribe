import { Wifi, WifiOff, Circle, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStatusNotification } from '@/hooks/use-status-notification';
import type { NotificationType } from '@/hooks/use-status-notification';

interface StatusBarProps {
  isRecording: boolean;
  recordingTime: number;
}

export function StatusBar({ isRecording, recordingTime }: StatusBarProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { current: currentNotification } = useStatusNotification();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="h-8 px-3 flex items-center justify-between bg-black backdrop-blur-sm border-b border-border"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-2">
        <span 
          className="text-status font-bold tabular-nums"
          data-testid="recording-timer"
        >
          {formatTime(recordingTime)}
        </span>
        {isRecording && (
          <Circle 
            className="w-3 h-3 fill-destructive text-destructive animate-pulse-recording" 
            data-testid="recording-indicator"
          />
        )}
      </div>

      <div className="flex items-center gap-1.5" data-testid="connection-status">
        {currentNotification ? (
          <>
            {getNotificationIcon(currentNotification.type)}
            <span 
              className="text-caption text-muted-foreground truncate max-w-[120px]" 
              title={currentNotification.description || currentNotification.title}
              data-testid="status-notification"
            >
              {currentNotification.title}
            </span>
          </>
        ) : isOnline ? (
          <>
            <Wifi className="w-4 h-4 text-status-online" />
            <span className="text-caption text-muted-foreground">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-status-offline" />
            <span className="text-caption text-muted-foreground">Offline</span>
          </>
        )}
      </div>
    </div>
  );
}