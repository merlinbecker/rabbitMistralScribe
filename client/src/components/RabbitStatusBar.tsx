import { Wifi, WifiOff, Battery, BatteryCharging, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useBatteryStatus } from '@/hooks/useBatteryStatus';

interface RabbitStatusBarProps {
  isOnline: boolean;
  isRecording: boolean;
  recordingTime: number;
  transcriptionStatus?: 'idle' | 'uploading' | 'transcribing' | 'complete' | 'failed';
  pendingUploads?: number;
}

export function RabbitStatusBar({ 
  isOnline, 
  isRecording, 
  recordingTime,
  transcriptionStatus = 'idle',
  pendingUploads = 0
}: RabbitStatusBarProps) {
  const battery = useBatteryStatus();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
        <div className="flex items-center gap-1">
          <span className="text-[10px]">{pendingUploads}</span>
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
      {/* Left side: Recording timer or connection status */}
      <div className="flex items-center gap-1">
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
