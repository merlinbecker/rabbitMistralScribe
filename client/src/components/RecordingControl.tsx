import { Button } from '@/components/ui/button';
import { Mic, Square } from 'lucide-react';
import { useState, useEffect } from 'react';

interface RecordingControlProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  disabled?: boolean;
}

export function RecordingControl({ isRecording, onToggleRecording, disabled = false }: RecordingControlProps) {
  const [isRabbitR1, setIsRabbitR1] = useState(false);

  useEffect(() => {
    // Prüfe ob sideClick Event verfügbar ist (Rabbit R1)
    const checkRabbitR1 = () => {
      // Teste ob sideClick Event funktioniert
      const testHandler = () => {
        setIsRabbitR1(true);
        window.removeEventListener('sideClick', testHandler);
      };
      window.addEventListener('sideClick', testHandler);
      
      // Cleanup nach 100ms wenn kein Event kam
      setTimeout(() => {
        window.removeEventListener('sideClick', testHandler);
      }, 100);
    };

    checkRabbitR1();
  }, []);

  // Verstecke Button auf Rabbit R1
  if (isRabbitR1) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 p-3 bg-black border-t border-border">
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
