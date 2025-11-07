import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';

interface RecordingControlProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  disabled?: boolean;
}

export function RecordingControl({ isRecording, onToggleRecording, disabled = false }: RecordingControlProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t border-border">
      <Button
        onClick={onToggleRecording}
        disabled={disabled}
        variant={isRecording ? "destructive" : "default"}
        className="w-full text-body font-medium"
        style={{ minHeight: '48px' }}
        data-testid={isRecording ? "button-stop-recording" : "button-start-recording"}
      >
        {isRecording ? (
          <>
            <Square className="w-5 h-5 mr-2 fill-current" />
            Aufnahme stoppen
          </>
        ) : (
          <>
            <Mic className="w-5 h-5 mr-2" />
            Aufnahme starten
          </>
        )}
      </Button>
    </div>
  );
}
