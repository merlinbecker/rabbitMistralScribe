import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LEDPixelDisplay } from '@/components/LEDPixelDisplay';
import { StatusBar } from '@/components/StatusBar';
import { RecordingControl } from '@/components/RecordingControl';
import { RecordingsList } from '@/components/RecordingsList';
import { useToast } from '@/hooks/use-toast';
import { Recording } from '@shared/schema';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { queryClient } from '@/lib/queryClient';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  // Fetch recordings
  const { data: recordings = [], isLoading, error } = useQuery<Recording[]>({
    queryKey: ['/api/recordings'],
    retry: 2,
  });

  // Handle sideClick event for Rabbit R1
  useEffect(() => {
    const handleSideClick = () => {
      toggleRecording();
    };

    window.addEventListener('sideClick', handleSideClick);
    return () => window.removeEventListener('sideClick', handleSideClick);
  }, [isRecording]);

  // Timer for recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setRecordingTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      setAudioStream(stream);
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Save to IndexedDB for offline support
        await saveRecordingLocally(audioBlob, recordingTime);
        
        // Clean up
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);

        toast({
          title: 'Aufnahme gespeichert',
          description: 'Die Aufnahme wird verarbeitet...',
        });
      };

      mediaRecorder.start(100); // Collect data every 100ms for real-time visualization
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      toast({
        title: 'Aufnahme gestartet',
        description: 'Sprechen Sie jetzt...',
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Fehler',
        description: 'Mikrofonzugriff fehlgeschlagen',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const saveRecordingLocally = async (audioBlob: Blob, duration: number) => {
    try {
      // Upload to backend
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());

      const response = await fetch('/api/recordings', {
        method: 'POST',
        credentials: 'include', // Important for session cookies
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Failed to upload recording');
      }

      const recording = await response.json();

      toast({
        title: 'Aufnahme gespeichert',
        description: 'Die Transkription läuft im Hintergrund...',
      });

      // Refetch recordings list to show new recording
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });

      // Poll for updates (check every 3 seconds for up to 2 minutes)
      let pollCount = 0;
      const maxPolls = 40; // 2 minutes / 3 seconds
      const pollInterval = setInterval(async () => {
        pollCount++;
        const updatedRecordings = await fetch('/api/recordings', {
          credentials: 'include',
        }).then(r => r.json());

        const updated = updatedRecordings.find((r: Recording) => r.id === recording.id);
        
        if (updated?.status === 'transcribed') {
          clearInterval(pollInterval);
          toast({
            title: 'Erfolgreich transkribiert',
            description: 'Die Notiz wurde transkribiert und in GitHub gespeichert.',
          });
          queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
        } else if (updated?.status === 'failed' || pollCount >= maxPolls) {
          clearInterval(pollInterval);
          if (updated?.status === 'failed') {
            toast({
              title: 'Transkription fehlgeschlagen',
              description: 'Bitte prüfen Sie Ihren Mistral API-Schlüssel in den Einstellungen.',
              variant: 'destructive',
            });
          }
          queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
        }
      }, 3000);
    } catch (error) {
      console.error('Error saving recording:', error);
      
      toast({
        title: 'Upload fehlgeschlagen',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background max-w-[240px] mx-auto">
      <StatusBar isRecording={isRecording} recordingTime={recordingTime} />
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-status font-bold">Audio Notes</h1>
            <Link href="/settings">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <LEDPixelDisplay isRecording={isRecording} audioStream={audioStream} />
        </div>

        <RecordingsList recordings={recordings} isLoading={isLoading} />
      </div>

      <RecordingControl 
        isRecording={isRecording} 
        onToggleRecording={toggleRecording}
      />
    </div>
  );
}
