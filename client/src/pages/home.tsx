import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LEDPixelDisplay } from '@/components/LEDPixelDisplay';
import { StatusBar } from '@/components/StatusBar';
import { RecordingControl } from '@/components/RecordingControl';
import { RecordingsList } from '@/components/RecordingsList';
import { useToast } from '@/hooks/use-toast';
import { Recording } from '@shared/schema';
import { Settings, Search, X, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { indexedDB } from '@/lib/indexedDB';

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  // Fetch recordings
  const { data: recordings = [], isLoading, error } = useQuery<Recording[]>({
    queryKey: ['/api/recordings'],
    retry: 2,
  });

  // Filter recordings based on search and status
  const filteredRecordings = useMemo(() => {
    let filtered = recordings;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.transcript?.toLowerCase().includes(query) ||
        r.summary?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [recordings, searchQuery, statusFilter]);

  // Count pending recordings
  const pendingCount = recordings.filter(r => r.status === 'pending').length;

  // Batch transcribe mutation
  const batchTranscribeMutation = useMutation({
    mutationFn: async () => {
      const pendingRecordings = recordings.filter(r => r.status === 'pending');
      const results = [];

      for (const recording of pendingRecordings) {
        try {
          const result = await apiRequest('POST', `/api/recordings/${recording.id}/transcribe`);
          results.push({ id: recording.id, success: true });
        } catch (error) {
          results.push({ id: recording.id, success: false, error });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });

      toast({
        title: 'Batch-Verarbeitung abgeschlossen',
        description: `${successCount} erfolgreich, ${failCount} fehlgeschlagen`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Batch-Verarbeitung fehlgeschlagen',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Monitor network status and sync pending recordings
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[NETWORK] Connection restored');
      setIsOnline(true);

      toast({
        title: 'Verbindung wiederhergestellt',
        description: 'Ausstehende Aufnahmen werden hochgeladen...',
      });

      await syncPendingRecordings();
    };

    const handleOffline = () => {
      console.log('[NETWORK] Connection lost');
      setIsOnline(false);

      toast({
        title: 'Verbindung verloren',
        description: 'Aufnahmen werden lokal gespeichert.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync on initial load
    if (navigator.onLine) {
      syncPendingRecordings();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
        console.log('[CLIENT] ========================================');
        console.log('[CLIENT] MediaRecorder onstop event fired');
        console.log('[CLIENT] Audio chunks collected:', audioChunksRef.current.length);
        console.log('[CLIENT] Recording time:', recordingTime);
        console.log('[CLIENT] ========================================');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('[CLIENT] Audio Blob created:', {
          size: audioBlob.size,
          type: audioBlob.type
        });

        // Save to IndexedDB for offline support
        console.log('[CLIENT] Calling saveRecordingLocally...');
        await saveRecordingLocally(audioBlob, recordingTime);
        console.log('[CLIENT] saveRecordingLocally completed');

        // Clean up
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);

        toast({
          title: 'Aufnahme gespeichert',
          description: 'Die Aufnahme wird verarbeitet...',
        });
        
        console.log('[CLIENT] ========================================');
        console.log('[CLIENT] onstop cleanup completed');
        console.log('[CLIENT] ========================================');
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
    console.log('[CLIENT] ========================================');
    console.log('[CLIENT] stopRecording() called');
    console.log('[CLIENT] isRecording:', isRecording);
    console.log('[CLIENT] mediaRecorder exists:', !!mediaRecorderRef.current);
    console.log('[CLIENT] ========================================');
    
    if (mediaRecorderRef.current && isRecording) {
      console.log('[CLIENT] Stopping MediaRecorder...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      console.log('[CLIENT] MediaRecorder stopped, onstop event should fire');
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
    console.log('[CLIENT] ========================================');
    console.log('[CLIENT] saveRecordingLocally() called');
    console.log('[CLIENT] Blob size:', audioBlob.size);
    console.log('[CLIENT] Duration:', duration);
    console.log('[CLIENT] ========================================');
    
    const recordingId = crypto.randomUUID();
    console.log('[CLIENT] Generated recording ID:', recordingId);

    try {
      // Always save to IndexedDB first
      console.log('[CLIENT] Saving to IndexedDB...');
      await indexedDB.addRecording({
        id: recordingId,
        audioBlob,
        duration,
        timestamp: Date.now(),
        status: 'queued',
      });

      console.log('[CLIENT] ✅ Recording saved to IndexedDB:', recordingId);

      // If online, try to upload immediately
      console.log('[CLIENT] Checking network status...');
      console.log('[CLIENT] navigator.onLine:', navigator.onLine);
      
      if (navigator.onLine) {
        console.log('[CLIENT] ========================================');
        console.log('[CLIENT] Network is online - starting upload');
        console.log('[CLIENT] ========================================');
        await uploadRecording(recordingId, audioBlob, duration);
      } else {
        console.log('[CLIENT] Network is offline - skipping upload');
        toast({
          title: 'Aufnahme gespeichert',
          description: 'Wird hochgeladen, sobald Verbindung besteht.',
        });
      }
    } catch (error) {
      console.error('[CLIENT] ========================================');
      console.error('[CLIENT] ❌ Error saving recording');
      console.error('[CLIENT] Error:', error);
      console.error('[CLIENT] Stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('[CLIENT] ========================================');

      toast({
        title: 'Speicherfehler',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    }
  };

  const uploadRecording = async (localId: string, audioBlob: Blob, duration: number) => {
    console.log('[CLIENT] ========================================');
    console.log('[CLIENT] uploadRecording() called');
    console.log('[CLIENT] Local ID:', localId);
    console.log('[CLIENT] Timestamp:', new Date().toISOString());
    console.log('[CLIENT] ========================================');
    
    try {
      // Mark as uploading
      console.log('[CLIENT] Updating IndexedDB status to uploading...');
      await indexedDB.updateRecording(localId, { status: 'uploading' });
      console.log('[CLIENT] ✅ IndexedDB status updated');

      console.log('[CLIENT] Recording upload details:', {
        localId,
        blobSize: audioBlob.size,
        blobType: audioBlob.type,
        duration
      });

      console.log('[CLIENT] Creating FormData...');
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());
      console.log('[CLIENT] ✅ FormData created');

      console.log('[CLIENT] ========================================');
      console.log('[CLIENT] 🚀 SENDING FETCH REQUEST TO /api/recordings');
      console.log('[CLIENT] Method: POST');
      console.log('[CLIENT] Credentials: include');
      console.log('[CLIENT] Body: FormData with audio and duration');
      console.log('[CLIENT] ========================================');
      
      const response = await fetch('/api/recordings', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      console.log('[CLIENT] ========================================');
      console.log('[CLIENT] 📥 FETCH RESPONSE RECEIVED');
      console.log('[CLIENT] Status:', response.status);
      console.log('[CLIENT] Status Text:', response.statusText);
      console.log('[CLIENT] OK:', response.ok);
      console.log('[CLIENT] ========================================');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        console.error('[CLIENT] Upload failed:', errorData);

        // Mark as failed in IndexedDB
        await indexedDB.updateRecording(localId, { status: 'failed' });

        throw new Error(errorData.error || 'Failed to upload recording');
      }

      const recording = await response.json();
      console.log('[CLIENT] Recording uploaded:', recording.id);

      toast({
        title: 'Aufnahme hochgeladen',
        description: 'Die Transkription läuft im Hintergrund...',
      });

      // Refetch recordings list
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });

      // Start polling for transcription status
      pollTranscriptionStatus(recording.id, localId);

    } catch (error) {
      console.error('[CLIENT] Error uploading recording:', error);

      // Mark as failed but keep in IndexedDB for retry
      await indexedDB.updateRecording(localId, { status: 'failed' });

      toast({
        title: 'Upload fehlgeschlagen',
        description: 'Aufnahme bleibt lokal gespeichert.',
        variant: 'destructive',
      });
    }
  };

  const pollTranscriptionStatus = (recordingId: string, localId: string) => {
    let pollCount = 0;
    const maxPolls = 16; // 4 minutes / 15 seconds

    const pollInterval = setInterval(async () => {
      pollCount++;

      try {
        const updatedRecordings = await fetch('/api/recordings', {
          credentials: 'include',
        }).then(r => r.json());

        const updated = updatedRecordings.find((r: Recording) => r.id === recordingId);

        if (updated?.status === 'transcribed') {
          clearInterval(pollInterval);

          // Delete from IndexedDB after successful transcription
          await indexedDB.deleteRecording(localId);

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
      } catch (error) {
        console.error('[CLIENT] Error polling transcription status:', error);
      }
    }, 15000);
  };

  const syncPendingRecordings = async () => {
    try {
      const pendingRecordings = await indexedDB.getAllRecordings();

      if (pendingRecordings.length === 0) {
        console.log('[SYNC] No pending recordings to sync');
        return;
      }

      console.log('[SYNC] Found', pendingRecordings.length, 'pending recordings');

      for (const pending of pendingRecordings) {
        if (pending.status === 'queued' || pending.status === 'failed') {
          console.log('[SYNC] Uploading pending recording:', pending.id);
          await uploadRecording(pending.id, pending.audioBlob, pending.duration);
        }
      }
    } catch (error) {
      console.error('[SYNC] Error syncing pending recordings:', error);
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

          {/* Search and Filter Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Notizen durchsuchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 text-body"
                data-testid="input-search"
              />
              {searchQuery && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-0 top-1/2 transform -translate-y-1/2"
                  data-testid="button-clear-search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="flex-1" data-testid="select-status-filter">
                  <SelectValue placeholder="Status filtern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="transcribing">In Verarbeitung</SelectItem>
                  <SelectItem value="transcribed">Transkribiert</SelectItem>
                  <SelectItem value="failed">Fehler</SelectItem>
                </SelectContent>
              </Select>

              {pendingCount > 0 && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => batchTranscribeMutation.mutate()}
                  disabled={batchTranscribeMutation.isPending}
                  data-testid="button-batch-transcribe"
                  className="gap-1"
                >
                  {batchTranscribeMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  <span className="text-caption">Alle ({pendingCount})</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        <RecordingsList recordings={filteredRecordings} isLoading={isLoading} />
      </div>

      <RecordingControl 
        isRecording={isRecording} 
        onToggleRecording={toggleRecording}
      />
    </div>
  );
}