import { useState, useEffect, useRef, useCallback } from 'react';
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
import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

const MAX_RECORDING_TIME = 817; // 13:37 in seconds

/**
 * Rabbit R1 optimized view
 * - No authentication required
 * - Minimal UI: LED display + small status bar only
 * - Completely offline capable
 * - Max recording time: 13:37
 */
export default function RabbitR1() {
  console.log('[RABBIT] Component mounted');
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mistralBitmap, setMistralBitmap] = useState<LEDBitmap | null>(null);
  const [microphoneBitmap, setMicrophoneBitmap] = useState<LEDBitmap | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'idle' | 'uploading' | 'transcribing' | 'complete' | 'failed'>('idle');
  const [clickCount, setClickCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [bitmapLoadedTimestamp, setBitmapLoadedTimestamp] = useState<number>(0);
  
  const isOnline = useOnlineStatus();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load LED bitmaps on mount
  useEffect(() => {
    let isMounted = true;
    
    const loadBitmaps = async () => {
      try {
        console.log('[RABBIT] Loading bitmaps...');
        
        // Load Mistral logo
        const mistralProvider = new ImageBitmapProvider({
          imageUrl: `${window.location.origin}/mistral.png`,
          colorMode: 'full',
          brightness: 1.0
        });
        
        await mistralProvider.load();
        
        if (!isMounted) return;
        
        const bitmap = mistralProvider.getBitmap();
        console.log('[RABBIT] Mistral bitmap loaded:', bitmap);
        console.log('[RABBIT] First pixel:', bitmap[0][0]);
        console.log('[RABBIT] Center pixel:', bitmap[8][8]);
        console.log('[RABBIT] Setting state with bitmap');
        setMistralBitmap(bitmap);
        setBitmapLoadedTimestamp(Date.now());

        // Load microphone icon (we'll create a simple one programmatically)
        const micBitmap = createMicrophoneBitmap();
        console.log('[RABBIT] Microphone bitmap created');
        setMicrophoneBitmap(micBitmap);
      } catch (error) {
        console.error('[RABBIT] Failed to load bitmaps:', error);
        // Fallback: create empty bitmap
        if (isMounted) {
          setMistralBitmap(createMicrophoneBitmap());
        }
      }
    };

    loadBitmaps();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Check authentication status (non-blocking) - only once on mount and when coming online
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      if (!isOnline) {
        console.log('[RABBIT] 🔌 Offline - skipping auth check');
        return;
      }
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('[RABBIT] No auth token found');
        setIsAuthenticated(false);
        return;
      }
      
      console.log('[RABBIT] 🔍 Checking authentication...');
      
      try {
        const response = await fetch('/api/auth/user', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (isMounted) {
          const wasAuthenticated = isAuthenticated;
          const nowAuthenticated = response.ok;
          
          if (!nowAuthenticated) {
            localStorage.removeItem('auth_token');
          }
          
          console.log('[RABBIT] Auth state:', { wasAuthenticated, nowAuthenticated });
          
          setIsAuthenticated(nowAuthenticated);
          
          // If just authenticated, sync recordings
          if (nowAuthenticated && !wasAuthenticated) {
            console.log('[RABBIT] 🎉 Just authenticated - syncing recordings');
            await syncPendingRecordings();
          }
        }
      } catch (error) {
        console.error('[RABBIT] ❌ Auth check error:', error);
        if (isMounted) {
          setIsAuthenticated(false);
          localStorage.removeItem('auth_token');
        }
      }
    };

    // Check if returning from auth
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      console.log('[RABBIT] 🔄 Returning from GitHub auth - saving token');
      
      // Save token to localStorage
      localStorage.setItem('auth_token', token);
      
      // Clean URL immediately
      window.history.replaceState({}, '', '/');
      console.log('[RABBIT] ✅ Token saved, URL cleaned');
      
      // Mark as authenticated immediately
      setIsAuthenticated(true);
      
      // Sync pending recordings immediately (token is already in localStorage)
      // Don't wait for state update - use token directly
      const syncImmediately = async () => {
        try {
          const pendingRecordings = await indexedDB.getAllRecordings();
          
          if (pendingRecordings.length === 0) {
            return;
          }

          console.log(`[RABBIT] Syncing ${pendingRecordings.length} pending recording(s) via HTTP`);
          
          for (const pending of pendingRecordings) {
            if (pending.status === 'queued' || pending.status === 'failed') {
              await uploadRecording(pending.id, pending.audioBlob, pending.duration);
            }
          }
        } catch (error) {
          console.error('[RABBIT] Error syncing pending recordings:', error);
        }
      };
      
      syncImmediately().catch(err => 
        console.error('[RABBIT] Failed to sync recordings:', err)
      );
    } else {
      // Check if we have a valid token
      console.log('[RABBIT] No token in URL, checking localStorage...');
      checkAuth();
    }
    
    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  // Fetch local recordings from IndexedDB
  const { data: localRecordings = [] } = useQuery({
    queryKey: ['local-recordings'],
    queryFn: async () => {
      const pending = await indexedDB.getAllRecordings();
      return pending;
    },
    refetchInterval: 10000, // Check every 10 seconds (reduced from 3s)
  });

  // Monitor transcription status from local recordings (memoized to prevent unnecessary updates)
  useEffect(() => {
    const newStatus = (() => {
      if (localRecordings.length === 0) return 'idle';
      
      const hasUploading = localRecordings.some(r => r.status === 'uploading');
      const hasFailed = localRecordings.some(r => r.status === 'failed');
      const hasUploaded = localRecordings.some(r => r.status === 'uploaded');

      if (hasUploading) return 'uploading';
      if (hasFailed) return 'failed';
      if (hasUploaded) return 'transcribing';
      return 'idle';
    })();
    
    // Only update if status actually changed
    setTranscriptionStatus(prev => prev === newStatus ? prev : newStatus);
  }, [localRecordings]);

  // Auto-sync pending recordings when conditions are met
  useEffect(() => {
    // Only sync if:
    // 1. Device is online
    // 2. No recording is currently in progress
    // 3. There are pending recordings that need to be synced
    const hasPendingRecordings = localRecordings.some(
      r => r.status === 'queued' || r.status === 'failed'
    );

    if (isOnline && !isRecording && hasPendingRecordings) {
      console.log('[RABBIT] 🔄 Auto-sync conditions met - attempting to sync pending recordings');
      
      // Check if we're authenticated
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('[RABBIT] ⚠️ No auth token - showing login prompt');
        // Only show login prompt if not currently recording
        if (!isRecording) {
          setShowLoginPrompt(true);
        }
      } else if (isAuthenticated) {
        console.log('[RABBIT] ✅ Authenticated - syncing now');
        syncPendingRecordings().catch(err => 
          console.error('[RABBIT] Auto-sync failed:', err)
        );
      }
    }
  }, [isOnline, isRecording, localRecordings, isAuthenticated]);

  // Define toggleRecording first with useCallback
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording]);

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
  }, [toggleRecording]);

  // Direct HTTP sync when coming online (no service worker on Rabbit R1)
  useEffect(() => {
    const handleOnline = async () => {
      console.log('[RABBIT] Network came online - syncing pending recordings via HTTP');
      if (isAuthenticated) {
        await syncPendingRecordings();
      } else {
        // Show login prompt if there are pending recordings (but not during recording)
        const pending = await indexedDB.getAllRecordings();
        if (pending.length > 0 && !isRecording) {
          setShowLoginPrompt(true);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthenticated]);

  // Try to sync on mount if online and authenticated
  useEffect(() => {
    if (isOnline && isAuthenticated) {
      syncPendingRecordings();
    }
  }, [isOnline, isAuthenticated]);

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

        // Save locally first (offline capability)
        const localId = await saveRecordingLocally(audioBlob, recordingTime);
        
        // Immediately try to upload if online
        if (isOnline && localId) {
          if (isAuthenticated) {
            // Upload immediately
            await uploadRecording(localId, audioBlob, recordingTime);
          } else {
            // Show login prompt when online but not authenticated
            setShowLoginPrompt(true);
          }
        }
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

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Play stop sound
      playRecordingStopSound();
    }
  };

  const saveRecordingLocally = async (audioBlob: Blob, duration: number): Promise<string | null> => {
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

      return recordingId;
    } catch (error) {
      console.error('[RABBIT] Error saving recording:', error);
      return null;
    }
  };

  const uploadRecording = async (localId: string, audioBlob: Blob, duration: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsAuthenticated(false);
        await indexedDB.updateRecording(localId, { status: 'queued' });
        // Only show login prompt if not currently recording
        if (!isRecording) {
          setShowLoginPrompt(true);
        }
        return;
      }

      // Mark as uploading
      await indexedDB.updateRecording(localId, { status: 'uploading' });

      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());

      const response = await fetch('/api/recordings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        // Check if it's an auth error
        if (response.status === 401) {
          // Not authenticated - show login prompt (but not during recording)
          localStorage.removeItem('auth_token');
          setIsAuthenticated(false);
          await indexedDB.updateRecording(localId, { status: 'queued' });
          console.log('[RABBIT] 401 Unauthorized - redirecting to login');
          if (!isRecording) {
            setShowLoginPrompt(true);
          }
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
        const token = localStorage.getItem('auth_token');
        if (!token) return false;

        const response = await fetch('/api/recordings', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (!response.ok) return false;

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
      
      if (pendingRecordings.length === 0) {
        return;
      }

      // Check token directly instead of state (state updates are async)
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.log('[RABBIT] Cannot sync - no auth token');
        // Only show login prompt if not currently recording
        if (!isRecording) {
          setShowLoginPrompt(true);
        }
        return;
      }
      
      console.log(`[RABBIT] Syncing ${pendingRecordings.length} pending recording(s) via HTTP`);
      
      for (const pending of pendingRecordings) {
        if (pending.status === 'queued' || pending.status === 'failed') {
          await uploadRecording(pending.id, pending.audioBlob, pending.duration);
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

  const handleLogin = () => {
    // Redirect to GitHub OAuth
    console.log('[RABBIT] 🔐 Redirecting to GitHub OAuth...');
    window.location.href = '/api/auth/github';
  };

  const handleCancelLogin = () => {
    setShowLoginPrompt(false);
  };

  

  return (
    <div className="rabbit-view flex flex-col bg-black relative">
      {/* LED Display - main focal point */}
      <div className="flex-1 flex items-center justify-center p-2">
        <div onClick={handleLEDClick} className="cursor-pointer w-full max-w-[220px]">
          {(() => {
            console.log('[RABBIT] Render - isRecording:', isRecording, 'mistralBitmap:', !!mistralBitmap);
            
            if (isRecording) {
              if (audioStream) {
                return <LEDPixelDisplay key="audio" isRecording={isRecording} audioStream={audioStream} />;
              } else if (microphoneBitmap) {
                return <LEDPixelDisplay key="mic" bitmap={microphoneBitmap} refreshRate={10} />;
              } else {
                return <LEDPixelDisplay key="idle" isRecording={false} audioStream={null} />;
              }
            } else if (mistralBitmap) {
              console.log('[RABBIT] Rendering Mistral bitmap');
              return <LEDPixelDisplay key={`mistral-${bitmapLoadedTimestamp}`} bitmap={mistralBitmap} />;
            } else {
              console.log('[RABBIT] Showing loading...');
              return (
                <div className="w-[224px] h-[224px] bg-black rounded-md flex items-center justify-center text-white text-sm">
                  Lade...
                </div>
              );
            }
          })()}
        </div>
      </div>

      {/* Minimal status bar */}
      <RabbitStatusBar
        isOnline={isOnline}
        isRecording={isRecording}
        recordingTime={recordingTime}
        transcriptionStatus={transcriptionStatus}
      />

      {/* Login prompt overlay */}
      {showLoginPrompt && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-4 max-w-[200px] text-center">
            <div className="mb-3">
              <Github className="w-8 h-8 mx-auto text-white mb-2" />
              <p className="text-white text-sm mb-1">Anmeldung erforderlich</p>
              <p className="text-gray-400 text-xs">
                Für Upload und Transkription
              </p>
            </div>
            <div className="space-y-2">
              <Button
                onClick={handleLogin}
                className="w-full text-xs"
                size="sm"
              >
                Mit GitHub anmelden
              </Button>
              <Button
                onClick={handleCancelLogin}
                variant="ghost"
                className="w-full text-xs text-gray-400"
                size="sm"
              >
                Später
              </Button>
            </div>
          </div>
        </div>
      )}
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
