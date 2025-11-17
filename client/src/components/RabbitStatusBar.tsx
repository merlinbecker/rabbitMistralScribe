import { Wifi, WifiOff, Battery, BatteryCharging, Loader2, CheckCircle2, XCircle, Settings } from 'lucide-react';
import { useBatteryStatus } from '@/hooks/useBatteryStatus';
import { Link, useLocation } from 'wouter';

interface RabbitStatusBarProps {
  isOnline: boolean;
  isRecording: boolean;
  recordingTime: number;
  transcriptionStatus?: 'idle' | 'uploading' | 'transcribing' | 'complete' | 'failed';
  pendingUploads?: number;
  onShowLogin?: () => void;
}

export function RabbitStatusBar({ 
  isOnline, 
  isRecording, 
  recordingTime,
  transcriptionStatus = 'idle',
  pendingUploads = 0,
  onShowLogin,
}: RabbitStatusBarProps) {
  const [, setLocation] = useLocation();
  const battery = useBatteryStatus();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSettingsClick = async () => {
    if (!isOnline) {
      console.log('[RABBIT_STATUS_BAR] Offline - cannot access settings');
      return;
    }

    console.log('[RABBIT_STATUS_BAR] Checking authentication before accessing settings...');

    const token = localStorage.getItem('github_access_token');

    if (!token) {
      console.log('[RABBIT_STATUS_BAR] No token found - showing login');
      if (onShowLogin) {
        onShowLogin();
      }
      return;
    }

    try {
      const response = await fetch('/api/auth/user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        console.log('[RABBIT_STATUS_BAR] Authenticated - navigating to settings');
        setLocation('/settings');
      } else {
        console.log('[RABBIT_STATUS_BAR] Auth check failed - showing login');
        localStorage.removeItem('github_access_token');
        localStorage.removeItem('github_token_expiry');
        if (onShowLogin) {
          onShowLogin();
        }
      }
    } catch (error) {
      console.error('[RABBIT_STATUS_BAR] Auth check error:', error);
      if (onShowLogin) {
        onShowLogin();
      }
    }
  };

  const getBatteryIcon = () => {
    if (battery.charging) {
      return <BatteryCharging className="w-4 h-4" />;
    }
    return <Battery className="w-4 h-4" />;
  };

  const getBatteryLevel = () => {
    if (!battery.supported) return '';
    return `${Math.round(battery.level * 100)}%`;
  };

  const getTranscriptionIcon = () => {
    // Show spinner only when actively uploading/transcribing
    if (transcriptionStatus === 'uploading' || transcriptionStatus === 'transcribing') {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }

    // Show pending uploads count if any exist
    if (pendingUploads > 0) {
      return (
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] font-bold text-orange-400">{pendingUploads}</span>
          <span className="text-[8px] text-orange-400">⏳</span>
        </div>
      );
    }

    // Show result icons
    if (transcriptionStatus === 'failed') {
      return <XCircle className="w-4 h-4 text-red-600" />;
    }

    // Default: Show green checkmark (synced)
    return <CheckCircle2 className="w-4 h-4 text-green-600" />;
  };

  return (
    <div 
      className="h-6 px-2 flex items-center justify-between bg-black text-white"
      style={{ fontSize: '10px' }}
      data-testid="rabbit-status-bar"
    >
      {/* Left side: Settings icon, Recording timer or connection status */}
      <div className="flex items-center gap-1.5">
        <button 
          className="p-0 hover:opacity-70 transition-opacity"
          aria-label="Einstellungen"
          data-testid="settings-button"
          onClick={handleSettingsClick}
        >
          <Settings className="w-3 h-3" />
        </button>

        {isRecording ? (
          <span className="font-mono font-bold" data-testid="recording-timer">
            {formatTime(recordingTime)}
          </span>
        ) : (
          <>
            {isOnline ? (
              <Wifi className="w-3 h-3" data-testid="online-icon" />
            ) : (
              <WifiOff className="w-3 h-3" data-testid="offline-icon" />
            )}
          </>
        )}
      </div>

      {/* Right side: Battery and transcription status */}
      <div className="flex items-center gap-2">
        {/* Transcription status */}
        {getTranscriptionIcon()}

        {/* Battery status */}
        <div className="flex items-center gap-1">
          {getBatteryIcon()}
          {battery.supported && (
            <span className="font-mono" data-testid="battery-level">
              {getBatteryLevel()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}