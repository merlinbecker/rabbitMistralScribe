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
  const [isPollingActive, setIsPollingActive] = useState(false); // State to control polling

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for the polling interval

  const { toast } = useToast();

  // Fetch recordings
  const { data: recordings = [], isLoading, error, refetch: recordingsQueryRefetch } = useQuery<Recording[]>({
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
      // console.log('[NETWORK] Connection restored');
      setIsOnline(true);

      toast({
        title: 'Verbindung wiederhergestellt',
        description: 'Ausstehende Aufnahmen werden hochgeladen...',
      });

      await syncPendingRecordings();
    };

    const handleOffline = () => {
      // console.log('[NETWORK] Connection lost');
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

  // Polling effect - only when active
  useEffect(() => {
    if (!isPollingActive) return;

    const interval = setInterval(() => {
      recordingsQueryRefetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [isPollingActive]);

  // Auto-stop polling when all recordings are processed
  useEffect(() => {
    if (!isPollingActive) return;

    const processingCount = recordings.filter(
      r => r.status === 'pending' || r.status === 'transcribing'
    ).length;

    if (processingCount === 0) {
      // console.log('[POLLING] All recordings processed, stopping polling');
      setIsPollingActive(false);
    }
  }, [recordings, isPollingActive]);

  const fetchRecordingsAndCheckStatus = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
      const pendingItemsExist = recordings.some(r => r.status === 'pending' || r.status === 'transcribing');

      if (!pendingItemsExist && !isRecording) {
        // console.log('[POLLING] No pending or transcribing items and not recording. Stopping poll.');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('[POLLING] Error fetching recordings:', error);
      // Optionally stop polling on persistent errors
    }
  };

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
        // console.log('[RECORDING] Stopped. Processing audio...');

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // console.log('[RECORDING] Audio blob created:', { size: audioBlob.size, type: audioBlob.type });

        // Save to IndexedDB for offline support
        await saveRecordingLocally(audioBlob, recordingTime);

        // Clean up
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);

        toast({
          title: 'Aufnahme gespeichert',
          description: 'Die Aufnahme wird verarbeitet...',
        });

        // console.log('[RECORDING] Processing complete.');
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
    // console.log('[RECORDING] Stopping...');
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
    // console.log('[LOCAL_SAVE] Saving to IndexedDB...');
    const recordingId = crypto.randomUUID();

    try {
      // Save locally first (will add serverRecordingId after upload)
      const localId = await indexedDB.saveRecording({
        id: recordingId, // Use the generated ID as local ID
        audioBlob,
        duration,
        timestamp: Date.now(),
        status: 'queued',
      });

      // console.log('[LOCAL_SAVE] Saved to IndexedDB:', localId);

      // If online, try to upload immediately
      if (navigator.onLine) {
        // console.log('[UPLOAD] Network is online - starting upload');
        await uploadRecording(localId, audioBlob, duration);
      } else {
        // console.log('[UPLOAD] Network is offline - skipping upload');
        toast({
          title: 'Aufnahme gespeichert',
          description: 'Wird hochgeladen, sobald Verbindung besteht.',
        });
      }
    } catch (error) {
      console.error('[LOCAL_SAVE] Error saving recording:', error);
      toast({
        title: 'Speicherfehler',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    }
  };

  const uploadRecording = async (localId: string, audioBlob: Blob, duration: number) => {
    // console.log('[UPLOAD] Starting upload for local ID:', localId);

    try {
      // Mark as uploading
      await indexedDB.updateRecording(localId, { status: 'uploading' });
      // console.log('[UPLOAD] IndexedDB status updated to uploading.');

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());

      // console.log('[UPLOAD] Sending POST request to /api/recordings');
      const response = await fetch('/api/recordings', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      // console.log('[UPLOAD] Response received:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        console.error('[UPLOAD] Failed:', errorData);

        await indexedDB.updateRecording(localId, { status: 'failed' });
        throw new Error(errorData.error || 'Failed to upload recording');
      }

      const recording = await response.json();
      // console.log('[UPLOAD] Success, server ID:', recording.id);

      // Update local status and store server recording ID for later cleanup
      await indexedDB.updateRecording(localId, { 
        status: 'uploaded',
        serverRecordingId: recording.id 
      });

      toast({
        title: 'Aufnahme hochgeladen',
        description: 'Die Transkription läuft im Hintergrund...',
      });

      // Refetch recordings list to show the newly uploaded recording
      await queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });

      // Ensure polling is active when a new recording is uploaded
      setIsPollingActive(true);
    } catch (error) {
      console.error('[UPLOAD] Error uploading recording:', error);
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
    const maxPolls = 16; // ~4 minutes at 15-second intervals

    const pollInterval = setInterval(async () => {
      pollCount++;

      try {
        const updatedRecordings = await fetch('/api/recordings', { credentials: 'include' }).then(r => r.json());
        const updated = updatedRecordings.find((r: Recording) => r.id === recordingId);

        if (!updated) {
          console.warn(`[POLL] Recording ${recordingId} not found in fetched list.`);
          if (pollCount >= maxPolls) {
            console.log('[POLL] Max poll count reached without finding recording. Stopping poll.');
            clearInterval(pollInterval);
            setIsPollingActive(false); // Stop polling if the recording disappears unexpectedly
          }
          return;
        }

        if (updated.status === 'transcribed') {
          console.log(`[POLL] Recording ${recordingId} transcribed successfully.`);
          clearInterval(pollInterval);

          // Delete from IndexedDB after successful transcription
          await indexedDB.deleteRecording(localId);
          console.log(`[POLL] Deleted local recording ${localId} from IndexedDB.`);

          toast({
            title: 'Erfolgreich transkribiert',
            description: 'Die Notiz wurde transkribiert und in GitHub gespeichert.',
          });

          queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });

          // Check if polling should continue for other items
          const remainingPending = recordings.some(r => r.status === 'pending' || r.status === 'transcribing');
          if (!remainingPending) {
              setIsPollingActive(false);
          }

        } else if (updated.status === 'failed' || pollCount >= maxPolls) {
          console.log(`[POLL] Recording ${recordingId} failed or max polls reached.`);
          clearInterval(pollInterval);

          if (updated.status === 'failed') {
            toast({
              title: 'Transkription fehlgeschlagen',
              description: 'Bitte prüfen Sie Ihren Mistral API-Schlüssel in den Einstellungen.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Polling beendet',
              description: 'Maximale Anzahl von Abfragen erreicht.',
              variant: 'warning',
            });
          }

          queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
          setIsPollingActive(false); // Stop polling on failure or max polls
        }
      } catch (error) {
        console.error('[POLL] Error polling transcription status:', error);
        // Consider stopping polling after a certain number of consecutive errors
        if (pollCount >= maxPolls) {
          console.log('[POLL] Max poll count reached during error. Stopping poll.');
          clearInterval(pollInterval);
          setIsPollingActive(false);
        }
      }
    }, 15000); // Poll every 15 seconds
  };

  const syncPendingRecordings = async () => {
    // console.log('[SYNC] Starting synchronization of pending recordings...');
    try {
      const pendingRecordings = await indexedDB.getAllRecordings();

      if (pendingRecordings.length === 0) {
        // console.log('[SYNC] No pending recordings found.');
        return;
      }

      // console.log('[SYNC] Found', pendingRecordings.length, 'pending recordings.');

      let uploadTriggered = false;
      for (const pending of pendingRecordings) {
        if (pending.status === 'queued' || pending.status === 'failed') {
          // console.log('[SYNC] Uploading pending recording:', pending.id);
          await uploadRecording(pending.id, pending.audioBlob, pending.duration);
          uploadTriggered = true;
        }
      }

      if (uploadTriggered) {
        // console.log('[SYNC] Uploads initiated, invalidating recordings query.');
        await queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
        // If uploads were initiated, activate polling
        setIsPollingActive(true);
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