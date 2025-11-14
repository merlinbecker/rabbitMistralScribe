import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LEDPixelDisplay } from '@/components/LEDPixelDisplay';
import { RabbitStatusBar } from '@/components/RabbitStatusBar';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { indexedDB } from '@/lib/indexedDB';
import { queryClient } from '@/lib/queryClient';
import { ImageBitmapProvider } from '@/lib/ledBitmap';
import type { LEDBitmap } from '@/lib/ledBitmap';
import { playRecordingStartSound, playRecordingStopSound } from '@/utils/audioFeedback';
import type { Recording } from '@shared/schema';

const MAX_RECORDING_TIME = 817; // 13:37 in seconds

/**
 * Rabbit R1 optimized view
 * - No authentication required
 * - Minimal UI: LED display + small status bar only
 * - Completely offline capable
 * - Max recording time: 13:37
 */
export default function RabbitR1() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mistralBitmap, setMistralBitmap] = useState<LEDBitmap | null>(null);
  const [microphoneBitmap, setMicrophoneBitmap] = useState<LEDBitmap | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'complete' | 'failed'>('idle');
  const [clickCount, setClickCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const isOnline = useOnlineStatus();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load LED bitmaps on mount
  useEffect(() => {
    const loadBitmaps = async () => {
      try {
        // Load Mistral logo
        const mistralProvider = new ImageBitmapProvider({
          imageUrl: '/mistral.png',
          colorMode: 'full',
          brightness: 1.0
        });
        await mistralProvider.load();
        setMistralBitmap(mistralProvider.getBitmap());

        // Load microphone icon (we'll create a simple one programmatically)
        const micBitmap = createMicrophoneBitmap();
        setMicrophoneBitmap(micBitmap);
      } catch (error) {
        console.error('Failed to load bitmaps:', error);
      }
    };

    loadBitmaps();
  }, []);

  // Check authentication status (non-blocking)
  useEffect(() => {
    const checkAuth = async () => {
      if (!isOnline) return;
      
      try {
        const response = await fetch('/api/auth/user', {
          credentials: 'include',
        });
        setIsAuthenticated(response.ok);
      } catch {
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, [isOnline]);

  // Fetch local recordings from IndexedDB
  const { data: localRecordings = [] } = useQuery({
    queryKey: ['local-recordings'],
    queryFn: async () => {
      const pending = await indexedDB.getAllRecordings();
      return pending;
    },
    refetchInterval: 3000, // Check every 3 seconds
  });

  // Monitor transcription status from local recordings
  useEffect(() => {
    if (localRecordings.length === 0) {
      setTranscriptionStatus('idle');
      return;
    }

    const hasUploading = localRecordings.some(r => r.status === 'uploading');
    const hasFailed = localRecordings.some(r => r.status === 'failed');
    const hasUploaded = localRecordings.some(r => r.status === 'uploaded');

    if (hasUploading) {
      setTranscriptionStatus('uploading');
    } else if (hasFailed) {
      setTranscriptionStatus('failed');
    } else if (hasUploaded) {
      setTranscriptionStatus('transcribing');
    } else {
      setTranscriptionStatus('idle');
    }
  }, [localRecordings]);

  // Timer for recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const newTime = prev + 1;
          
          // Auto-stop at max time
          if (newTime >= MAX_RECORDING_TIME) {
            stopRecording();
            return prev;
          }
          
          return newTime;
        });
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

  // Handle sideClick event for Rabbit R1
  useEffect(() => {
    const handleSideClick = () => {
      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      toggleRecording();
    };

    window.addEventListener('sideClick', handleSideClick);
    return () => window.removeEventListener('sideClick', handleSideClick);
  }, [isRecording]);

  // Sync pending recordings when coming online
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[RABBIT] Network came online - syncing pending recordings');
      await syncPendingRecordings();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Try to sync on mount if online
  useEffect(() => {
    if (isOnline) {
      syncPendingRecordings();
    }
  }, [isOnline]);

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

        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);

        // Save locally
        await saveRecordingLocally(audioBlob, recordingTime);
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      // Play start sound
      playRecordingStartSound();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Play stop sound
      playRecordingStopSound();
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
    const recordingId = crypto.randomUUID();

    try {
      // Save to IndexedDB
      await indexedDB.addRecording({
        id: recordingId,
        audioBlob,
        duration,
        createdAt: new Date(),
        status: 'queued',
      });

      // Refresh UI
      await queryClient.invalidateQueries({ queryKey: ['local-recordings'] });

      // Try to upload if online and authenticated
      if (isOnline && isAuthenticated) {
        uploadRecording(recordingId, audioBlob, duration);
      }
    } catch (error) {
      console.error('[RABBIT] Error saving recording:', error);
    }
  };

  const uploadRecording = async (localId: string, audioBlob: Blob, duration: number) => {
    try {
      // Mark as uploading
      await indexedDB.updateRecording(localId, { status: 'uploading' });

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());

      const response = await fetch('/api/recordings', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        // Check if it's an auth error
        if (response.status === 401) {
          // Not authenticated - keep in queue
          await indexedDB.updateRecording(localId, { status: 'queued' });
          console.log('[RABBIT] Not authenticated - keeping recording in queue');
          return;
        }
        throw new Error('Upload failed');
      }

      const recording = await response.json();

      // Update status
      await indexedDB.updateRecording(localId, {
        status: 'uploaded',
        serverRecordingId: recording.id
      });

      // Refresh
      await queryClient.invalidateQueries({ queryKey: ['local-recordings'] });
      
      // Start monitoring for transcription completion
      monitorTranscription(recording.id, localId);
    } catch (error) {
      console.error('[RABBIT] Upload failed:', error);
      await indexedDB.updateRecording(localId, { status: 'failed' });
    }
  };

  const monitorTranscription = async (serverId: string, localId: string) => {
    // Poll for transcription status
    let attempts = 0;
    const maxAttempts = 20; // ~5 minutes at 15s intervals

    const checkStatus = async () => {
      try {
        const response = await fetch('/api/recordings', {
          credentials: 'include',
        });
        
        if (!response.ok) return;

        const recordings: Recording[] = await response.json();
        const recording = recordings.find(r => r.id === serverId);

        if (recording?.status === 'transcribed') {
          // Success - delete local copy
          await indexedDB.deleteRecording(localId);
          await queryClient.invalidateQueries({ queryKey: ['local-recordings'] });
          setTranscriptionStatus('complete');
          
          // Reset after a few seconds
          setTimeout(() => setTranscriptionStatus('idle'), 5000);
          return true;
        } else if (recording?.status === 'failed') {
          setTranscriptionStatus('failed');
          setTimeout(() => setTranscriptionStatus('idle'), 5000);
          return true;
        }

        return false;
      } catch {
        return false;
      }
    };

    const poll = setInterval(async () => {
      attempts++;
      const done = await checkStatus();
      
      if (done || attempts >= maxAttempts) {
        clearInterval(poll);
      }
    }, 15000); // Check every 15 seconds
  };

  const syncPendingRecordings = async () => {
    try {
      const pendingRecordings = await indexedDB.getAllRecordings();
      
      for (const pending of pendingRecordings) {
        if (pending.status === 'queued' || pending.status === 'failed') {
          if (isAuthenticated) {
            await uploadRecording(pending.id, pending.audioBlob, pending.duration);
          }
        }
      }
    } catch (error) {
      console.error('[RABBIT] Error syncing pending recordings:', error);
    }
  };

  // Handle LED panel click
  const handleLEDClick = () => {
    // Vibrate if supported
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    if (isRecording) {
      // Double-click detection for stopping
      setClickCount(prev => prev + 1);
      
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }

      clickTimeoutRef.current = setTimeout(() => {
        if (clickCount >= 1) {
          // Double click detected
          stopRecording();
        }
        setClickCount(0);
      }, 300); // 300ms window for double click
    } else {
      // Start recording on single click when not recording
      playRecordingStartSound();
      startRecording();
    }
  };

  return (
    <div className="h-screen flex flex-col max-w-[240px] mx-auto bg-black">
      {/* LED Display - main focal point */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div onClick={handleLEDClick} className="cursor-pointer">
          {isRecording && audioStream ? (
            <LEDPixelDisplay isRecording={isRecording} audioStream={audioStream} />
          ) : microphoneBitmap && isRecording ? (
            <LEDPixelDisplay bitmap={microphoneBitmap} />
          ) : mistralBitmap ? (
            <LEDPixelDisplay bitmap={mistralBitmap} />
          ) : (
            <LEDPixelDisplay isRecording={false} audioStream={null} />
          )}
        </div>
      </div>

      {/* Minimal status bar */}
      <RabbitStatusBar
        isOnline={isOnline}
        isRecording={isRecording}
        recordingTime={recordingTime}
        transcriptionStatus={transcriptionStatus}
      />
    </div>
  );
}

/**
 * Create a simple microphone bitmap (16x16)
 */
function createMicrophoneBitmap(): LEDBitmap {
  const bitmap: LEDBitmap = Array(16).fill(null).map(() =>
    Array(16).fill(null).map(() => ({ color: '#000000', brightness: 0 }))
  );

  // Simple microphone icon in white
  const white = { color: '#FFFFFF', brightness: 1.0 };
  
  // Microphone body (centered)
  for (let row = 4; row <= 9; row++) {
    for (let col = 6; col <= 9; col++) {
      bitmap[row][col] = white;
    }
  }
  
  // Microphone stand
  for (let row = 10; row <= 12; row++) {
    bitmap[row][7] = white;
    bitmap[row][8] = white;
  }
  
  // Base
  for (let col = 5; col <= 10; col++) {
    bitmap[13][col] = white;
  }

  return bitmap;
}
