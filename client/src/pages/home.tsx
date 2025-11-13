import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { LEDPixelDisplay } from '@/components/LEDPixelDisplay';
import { StatusBar } from '@/components/StatusBar';
import { RecordingControl } from '@/components/RecordingControl';
import { RecordingsList } from '@/components/RecordingsList';
import { useToast } from '@/hooks/use-toast';
import { useRequireApiKey } from '@/hooks/useRequireApiKey';
import { Recording } from '@shared/schema';
import { Settings, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { indexedDB } from '@/lib/indexedDB';
import { ImageBitmapProvider } from '@/lib/ledBitmap';
import type { LEDBitmap } from '@/lib/ledBitmap';

export default function Home() {
  // Check if API key is configured and redirect to settings if not
  useRequireApiKey();

  // Load Mistral logo bitmap on mount
  useEffect(() => {
    const loadMistralLogo = async () => {
      try {
        const provider = new ImageBitmapProvider({
          imageUrl: '/mistral.png',
          colorMode: 'full',
          brightness: 1.0
        });
        await provider.load();
        setMistralBitmap(provider.getBitmap());
      } catch (error) {
        console.error('Failed to load Mistral logo:', error);
      }
    };

    loadMistralLogo();
  }, []);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPollingActive, setIsPollingActive] = useState(false); // State to control polling
  const [mistralBitmap, setMistralBitmap] = useState<LEDBitmap | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for the polling interval

  const { toast } = useToast();

  // Fetch server recordings
  const { data: serverRecordings = [], isLoading, error, refetch: recordingsQueryRefetch } = useQuery<Recording[]>({
    queryKey: ['/api/recordings'],
    retry: 2,
  });

  // Fetch local recordings from IndexedDB
  const { data: localRecordings = [] } = useQuery({
    queryKey: ['local-recordings'],
    queryFn: async () => {
      const pending = await indexedDB.getAllRecordings();
      return pending.map(p => ({
        id: p.id,
        userId: '', // Not needed for display
        title: p.title || null,
        audioUrl: p.audioBlob ? URL.createObjectURL(p.audioBlob) : null,
        duration: p.duration,
        status: p.status === 'queued' || p.status === 'failed' ? 'pending' : p.status,
        transcript: p.transcript || null,
        summary: p.summary || null,
        githubFileUrl: null,
        createdAt: p.createdAt,
        updatedAt: p.createdAt,
      } as Recording));
    },
    refetchInterval: 2000, // Refresh every 2 seconds to show local changes
  });

  // Sync local recordings with server data to enrich them
  useEffect(() => {
    const syncLocalWithServer = async () => {
      for (const localRec of localRecordings) {
        if (localRec.id) {
          // Find matching server recording by serverRecordingId
          const allLocalRecordings = await indexedDB.getAllRecordings();
          const localEntry = allLocalRecordings.find(r => r.id === localRec.id);

          if (localEntry?.serverRecordingId) {
            const serverRec = serverRecordings.find(s => s.id === localEntry.serverRecordingId);

            // If server has title/transcript/summary that local doesn't have, update local
            if (serverRec && (serverRec.title || serverRec.transcript || serverRec.summary)) {
              const needsUpdate =
                (serverRec.title && !localEntry.title) ||
                (serverRec.transcript && !localEntry.transcript) ||
                (serverRec.summary && !localEntry.summary);

              if (needsUpdate) {
                await indexedDB.updateRecording(localEntry.id, {
                  title: serverRec.title || localEntry.title,
                  transcript: serverRec.transcript || localEntry.transcript,
                  summary: serverRec.summary || localEntry.summary,
                });

                // Force immediate refetch to show updated data
                await queryClient.refetchQueries({ queryKey: ['local-recordings'] });
              }

              // If transcription is complete, delete the audio blob to save space
              if (serverRec.status === 'transcribed' && localEntry.audioBlob) {
                await indexedDB.deleteRecording(localEntry.id);
                await queryClient.refetchQueries({ queryKey: ['local-recordings'] });
              }
            }
          }
        }
      }
    };

    if (localRecordings.length > 0 && serverRecordings.length > 0) {
      syncLocalWithServer().catch(console.error);
    }
  }, [localRecordings, serverRecordings, queryClient]);

  // Merge server and local recordings, avoiding duplicates
  const recordings = React.useMemo(() => {
    const serverIds = new Set(serverRecordings.map(r => r.id));
    const uniqueLocalRecordings = localRecordings.filter(
      local => !serverRecordings.some(server => server.id === local.id)
    );
    return [...uniqueLocalRecordings, ...serverRecordings];
  }, [serverRecordings, localRecordings]);

  // Count processing recordings for status display
  const processingCount = recordings.filter(
    r => r.status === 'pending' || r.status === 'transcribing'
  ).length;

  // Check for pending uploads on mount (login/reload)
  useEffect(() => {
    const checkPendingUploads = async () => {
      if (!navigator.onLine) {
        console.log('[SYNC] Offline - skipping initial pending upload check');
        return;
      }

      console.log('[SYNC] Checking for pending uploads on mount...');
      await syncPendingRecordings();
    };

    // Run check after a short delay to ensure auth is established
    const timeoutId = setTimeout(checkPendingUploads, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  // Monitor network status and sync pending recordings
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[SYNC] Network came online - syncing pending recordings');
      await syncPendingRecordings();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('sync-recordings', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('sync-recordings', handleOnline);
    };
  }, []);

  // Handle sideClick event for Rabbit R1
  useEffect(() => {
    const handleSideClick = () => {
      // Vibrate device if supported (Rabbit R1)
      if ('vibrate' in navigator) {
        navigator.vibrate(50); // Short 50ms vibration
      }
      toggleRecording();
    };

    window.addEventListener('sideClick', handleSideClick);
    return () => window.removeEventListener('sideClick', handleSideClick);
  }, [isRecording]);

  // Keyboard fallback for sideClick in development (Ctrl+S)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        // Simulate sideClick event
        window.dispatchEvent(new Event('sideClick'));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

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
    }, 15000);

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

        // Clean up audio stream immediately
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);

        // Show immediate feedback
        toast({
          title: 'Aufnahme gespeichert',
          description: 'Die Aufnahme wird verarbeitet...',
        });

        // Save and upload in background (non-blocking)
        saveRecordingLocally(audioBlob, recordingTime).catch(error => {
          console.error('[RECORDING] Background save/upload failed:', error);
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
      await indexedDB.addRecording({
        id: recordingId, // Use the generated ID as local ID
        audioBlob,
        duration,
        createdAt: new Date(),
        status: 'queued',
      });
      const localId = recordingId;

      // console.log('[LOCAL_SAVE] Saved to IndexedDB:', localId);

      // Refresh UI immediately to show the pending item from IndexedDB
      await queryClient.invalidateQueries({ queryKey: ['local-recordings'] });

      // If online, try to upload immediately (in background)
      if (navigator.onLine) {
        // console.log('[UPLOAD] Network is online - starting upload');
        uploadRecording(localId, audioBlob, duration).catch(error => {
          console.error('[UPLOAD] Background upload failed:', error);
        });
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
      await queryClient.invalidateQueries({ queryKey: ['local-recordings'] });

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
          queryClient.invalidateQueries({ queryKey: ['local-recordings'] });

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
              variant: 'destructive',
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

  // Get only the most recent recording for the home view
  const latestRecording = recordings.length > 0 ? [recordings[0]] : [];

  return (
    <div className="h-screen flex flex-col max-w-[240px] mx-auto">
      <StatusBar isRecording={isRecording} recordingTime={recordingTime} />

      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-4">
          <div className="flex items-center justify-end gap-1 mb-2">
            <Link href="/recordings">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-recordings"
              >
                <Search className="w-4 h-4" />
              </Button>
            </Link>
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

          {isRecording ? (
            <LEDPixelDisplay isRecording={isRecording} audioStream={audioStream} />
          ) : mistralBitmap ? (
            <LEDPixelDisplay bitmap={mistralBitmap} />
          ) : (
            <LEDPixelDisplay isRecording={false} audioStream={null} />
          )}

          {/* Show only the last recording */}
          <RecordingsList recordings={latestRecording} isLoading={isLoading} showOnlyOne={true} />
        </div>
      </div>

      <RecordingControl
        isRecording={isRecording}
        onToggleRecording={toggleRecording}
      />
    </div>
  );
}