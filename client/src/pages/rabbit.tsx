import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { LEDPixelDisplay } from "@/components/LEDPixelDisplay";
import { RabbitStatusBar } from "@/components/RabbitStatusBar";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { indexedDB } from "@/lib/indexedDB";
import { queryClient, clearStoredToken, getStoredToken, setStoredToken } from "@/lib/queryClient";
import { ImageBitmapProvider } from "@/lib/ledBitmap";
import type { LEDBitmap } from "@/lib/ledBitmap";
import {
  playRecordingStartSound,
  playRecordingStopSound,
} from "@/utils/audioFeedback";
import type { Recording, UserSettings, GitHubRepo, UpdateUserSettings } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Github, X, Check, ExternalLink, LogOut, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useStatusNotification } from "@/hooks/use-status-notification";

const MAX_RECORDING_TIME = 817; // 13:37 in seconds

export default function RabbitR1() {
  console.log("[RABBIT] Component mounted");

  // --- State ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [mistralBitmap, setMistralBitmap] = useState<LEDBitmap | null>(null);
  const [microphoneBitmap, setMicrophoneBitmap] = useState<LEDBitmap | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<
    "idle" | "uploading" | "transcribing" | "complete" | "failed"
  >("idle");
  const [clickCount, setClickCount] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [bitmapLoadedTimestamp, setBitmapLoadedTimestamp] = useState<number>(0);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [summaryTemplate, setSummaryTemplate] = useState('');
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const isOnline = useOnlineStatus();
  const { notify } = useStatusNotification();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1. Token Handling (URL & LocalStorage) ---
  useEffect(() => {
    const checkToken = () => {
      const params = new URLSearchParams(location.search);
      const tokenFromUrl = params.get('token');

      if (tokenFromUrl) {
        console.log('[RABBIT] Token found in URL, storing...');
        setStoredToken(tokenFromUrl, 30);
        window.history.replaceState({}, '', '/');
        setIsAuthenticated(true);
      } else {
        const stored = getStoredToken();
        if (stored) {
          setIsAuthenticated(true);
        }
      }
    };
    checkToken();
  }, []);

  // --- 2. Main Workflow Loop ---
  useEffect(() => {
    if (!isOnline) return;

    const runWorkflow = async () => {
      const token = getStoredToken();

      // If no token, we can't do anything server-side
      if (!token) {
        // Only prompt if we are not recording and haven't prompted yet?
        // For now, we rely on the user clicking login or the prompt showing up when needed.
        return;
      }

      try {
        // Check Settings / Auth
        const res = await fetch('/api/settings', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) {
          console.log('[RABBIT] 401 Unauthorized - clearing token');
          clearStoredToken();
          setIsAuthenticated(false);
          setShowLoginPrompt(true);
          return;
        }

        if (res.ok) {
          const settings: UserSettings = await res.json();
          setUserSettings(settings);

          if (!settings.mistralApiKey) {
            console.log('[RABBIT] No Mistral Key - showing settings');
            setShowSettings(true);
          } else {
            // Settings valid -> Sync pending recordings
            syncPendingRecordings();
          }
        }
      } catch (error) {
        console.error('[RABBIT] Workflow check failed:', error);
      }
    };

    runWorkflow();
  }, [isOnline, isAuthenticated]); // Run when online status or auth changes

  // --- 3. Local Recordings & Polling ---
  const { data: localRecordings = [], refetch: refetchLocal } = useQuery({
    queryKey: ["local-recordings"],
    queryFn: async () => {
      return await indexedDB.getAllRecordings();
    },
    refetchInterval: 5000,
  });

  // Calculate pending uploads for status bar
  const pendingUploadsCount = localRecordings.filter(
    (r) => r.status === "queued" || r.status === "failed"
  ).length;

  // Monitor transcription status
  useEffect(() => {
    // Determine overall status
    const hasUploading = localRecordings.some(r => r.status === "uploading");
    const hasFailed = localRecordings.some(r => r.status === "failed");
    const hasUploaded = localRecordings.some(r => r.status === "uploaded"); // Waiting for transcription

    if (hasUploading) setTranscriptionStatus("uploading");
    else if (hasFailed) setTranscriptionStatus("failed");
    else if (hasUploaded) setTranscriptionStatus("transcribing");
    else setTranscriptionStatus("idle");

    // Polling logic for uploaded recordings
    const uploadedRecordings = localRecordings.filter(r => r.status === "uploaded" && r.serverRecordingId);

    if (uploadedRecordings.length > 0 && isOnline && isAuthenticated) {
      if (!pollIntervalRef.current) {
        console.log('[RABBIT] Starting polling for', uploadedRecordings.length, 'recordings');
        pollIntervalRef.current = setInterval(() => {
          checkServerStatus(uploadedRecordings);
        }, 15000); // Poll every 15s

        // Check immediately too
        checkServerStatus(uploadedRecordings);
      }
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [localRecordings, isOnline, isAuthenticated]);

  const checkServerStatus = async (recordings: typeof localRecordings) => {
    const token = getStoredToken();
    if (!token) return;

    try {
      const res = await fetch('/api/recordings', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) return;

      const serverRecordings: Recording[] = await res.json();

      for (const localRec of recordings) {
        if (!localRec.serverRecordingId) continue;

        const serverRec = serverRecordings.find(r => r.id === localRec.serverRecordingId);
        if (serverRec) {
          if (serverRec.status === 'transcribed') {
            console.log('[RABBIT] Transcription complete for', localRec.id);
            await indexedDB.deleteRecording(localRec.id);
            refetchLocal();
            notify({
              title: 'Transkription fertig',
              description: 'Aufnahme wurde erfolgreich verarbeitet.',
              type: 'success'
            });
          } else if (serverRec.status === 'failed') {
            // Handle failure? Maybe keep local but mark failed?
            // User said: "wenn der client die meldung bekommt, dass die entsprechende transkription erfolgreich war, wird auch die aufnahme auf dem client gelöscht."
            // If failed, maybe we should let the user retry?
            await indexedDB.updateRecording(localRec.id, { status: 'failed' });
            refetchLocal();
          }
        }
      }
    } catch (error) {
      console.error('[RABBIT] Polling failed:', error);
    }
  };

  // --- 4. Sync Logic ---
  const syncPendingRecordings = async () => {
    const pending = await indexedDB.getAllRecordings();
    const toUpload = pending.filter(r => r.status === 'queued' || r.status === 'failed');

    if (toUpload.length === 0) return;

    console.log('[RABBIT] Syncing', toUpload.length, 'recordings');

    for (const rec of toUpload) {
      await uploadRecording(rec.id, rec.audioBlob, rec.duration);
    }
  };

  const uploadRecording = async (localId: string, blob: Blob, duration: number) => {
    const token = getStoredToken();
    if (!token) return;

    try {
      await indexedDB.updateRecording(localId, { status: 'uploading' });
      refetchLocal();

      const formData = new FormData();
      formData.append("audio", blob);
      formData.append("duration", duration.toString());

      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.status === 401) {
        clearStoredToken();
        setIsAuthenticated(false);
        setShowLoginPrompt(true);
        await indexedDB.updateRecording(localId, { status: 'failed' }); // Retry later
        return;
      }

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.status}`);
      }

      const serverRec: Recording = await res.json();

      await indexedDB.updateRecording(localId, {
        status: 'uploaded',
        serverRecordingId: serverRec.id
      });
      refetchLocal();
      console.log('[RABBIT] Upload success, server ID:', serverRec.id);

    } catch (error) {
      console.error('[RABBIT] Upload error:', error);
      await indexedDB.updateRecording(localId, { status: 'failed' });
      refetchLocal();
    }
  };

  // --- 5. Recording Actions ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setAudioStream(stream);
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setAudioStream(null);

        // Save locally
        const id = crypto.randomUUID();
        await indexedDB.addRecording({
          id,
          audioBlob,
          duration: recordingTime,
          createdAt: new Date(),
          status: "queued",
        });
        refetchLocal();

        // Try sync if online
        if (isOnline && isAuthenticated && userSettings?.mistralApiKey) {
          uploadRecording(id, audioBlob, recordingTime);
        } else if (isOnline && !isAuthenticated) {
          setShowLoginPrompt(true);
        }
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      playRecordingStartSound();
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      playRecordingStopSound();
    }
  };

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording]);

  // Timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev + 1 >= MAX_RECORDING_TIME) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // Side Click
  useEffect(() => {
    const handleSideClick = () => {
      if ("vibrate" in navigator) navigator.vibrate(50);
      toggleRecording();
    };
    window.addEventListener("sideClick", handleSideClick);
    return () => window.removeEventListener("sideClick", handleSideClick);
  }, [toggleRecording]);

  // Load Bitmaps
  useEffect(() => {
    let isMounted = true;
    const loadBitmaps = async () => {
      try {
        const mistralProvider = new ImageBitmapProvider({
          imageUrl: `${window.location.origin}/mistral.png`,
          colorMode: "full",
          brightness: 1.0,
        });
        await mistralProvider.load();
        if (isMounted) {
          setMistralBitmap(mistralProvider.getBitmap());
          setBitmapLoadedTimestamp(Date.now());
          setMicrophoneBitmap(createMicrophoneBitmap());
        }
      } catch (e) {
        if (isMounted) setMistralBitmap(createMicrophoneBitmap());
      }
    };
    loadBitmaps();
    return () => { isMounted = false; };
  }, []);

  // --- 6. Settings Actions ---
  const handleSaveSettings = async () => {
    const token = getStoredToken();
    if (!token) return;

    const updates: UpdateUserSettings = {};
    if (apiKey) updates.mistralApiKey = apiKey;
    if (selectedRepo) {
      const [owner, name] = selectedRepo.split('/');
      updates.githubRepoOwner = owner;
      updates.githubRepoName = name;
    }
    if (summaryTemplate) updates.summaryTemplate = summaryTemplate;

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (res.ok) {
        const newSettings = await res.json();
        setUserSettings(newSettings);
        setShowSettings(false);
        notify({ title: 'Gespeichert', description: 'Einstellungen aktualisiert', type: 'success' });
        syncPendingRecordings();
      }
    } catch (e) {
      notify({ title: 'Fehler', description: 'Speichern fehlgeschlagen', type: 'error' });
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setIsAuthenticated(false);
    setShowSettings(false);
    setShowLoginPrompt(true);
    notify({ title: 'Abgemeldet', description: 'Erfolgreich abgemeldet', type: 'success' });
  };

  // Fetch Repos for Settings
  const { data: repos = [] } = useQuery<GitHubRepo[]>({
    queryKey: ['/api/github/repos'],
    queryFn: async () => {
      const token = getStoredToken();
      if (!token) return [];
      const res = await fetch('/api/github/repos', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showSettings && isAuthenticated,
  });

  // Pre-fill settings form
  useEffect(() => {
    if (userSettings) {
      if (userSettings.summaryTemplate) setSummaryTemplate(userSettings.summaryTemplate);
      if (userSettings.githubRepoOwner && userSettings.githubRepoName) {
        setSelectedRepo(`${userSettings.githubRepoOwner}/${userSettings.githubRepoName}`);
      }
    }
  }, [userSettings]);


  // --- Render ---
  return (
    <div className="rabbit-view flex flex-col bg-black relative">
      {/* LED Display */}
      <div className="flex-1 flex items-center justify-center p-2">
        <div onClick={() => {
          if (isRecording) {
            // Double click logic
            setClickCount(p => p + 1);
            if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = setTimeout(() => {
              if (clickCount >= 1) stopRecording();
              setClickCount(0);
            }, 300);
          } else {
            startRecording();
          }
        }} className="cursor-pointer w-full max-w-[220px]">
          {isRecording ? (
            audioStream ? <LEDPixelDisplay key="audio" isRecording={true} audioStream={audioStream} /> :
              microphoneBitmap ? <LEDPixelDisplay key="mic" bitmap={microphoneBitmap} refreshRate={10} /> : null
          ) : (
            mistralBitmap ? <LEDPixelDisplay key={`mistral-${bitmapLoadedTimestamp}`} bitmap={mistralBitmap} /> :
              <div className="w-[224px] h-[224px] bg-black rounded-md flex items-center justify-center text-white text-sm">Lade...</div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="relative">
        <RabbitStatusBar
          isOnline={isOnline}
          isRecording={isRecording}
          recordingTime={recordingTime}
          transcriptionStatus={transcriptionStatus}
          pendingUploads={pendingUploadsCount}
          onSettingsClick={() => setShowSettings(true)}
        />
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center p-3 overflow-y-auto z-50">
          <div className="bg-gray-900 rounded-lg w-full max-w-[240px] max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
              <h2 className="text-white text-sm font-bold">Einstellungen</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="h-8 w-8 text-white hover:bg-gray-800">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-3 space-y-3">
              {/* Mistral Key */}
              <Card className="p-3 bg-gray-800 border-gray-700">
                <Label className="text-white text-xs">Mistral API-Schlüssel</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="h-8 text-xs bg-gray-700 border-gray-600 text-white mt-1"
                />
                {userSettings?.mistralApiKey && !apiKey && <p className="text-xs text-green-400 mt-1"><Check className="w-3 h-3 inline" /> Gespeichert</p>}
              </Card>

              {/* GitHub Repo */}
              <Card className="p-3 bg-gray-800 border-gray-700">
                <Label className="text-white text-xs">GitHub Repository</Label>
                <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                  <SelectTrigger className="h-8 text-xs bg-gray-700 border-gray-600 text-white mt-1">
                    <SelectValue placeholder="Wählen..." />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {repos.map(r => (
                      <SelectItem key={r.id} value={r.full_name} className="text-white text-xs">{r.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>

              {/* Template */}
              <Card className="p-3 bg-gray-800 border-gray-700">
                <Label className="text-white text-xs">Prompt Template</Label>
                <Textarea
                  value={summaryTemplate}
                  onChange={e => setSummaryTemplate(e.target.value)}
                  className="text-xs bg-gray-700 border-gray-600 text-white mt-1 min-h-[60px]"
                />
              </Card>

              <Button onClick={handleSaveSettings} className="w-full h-9 text-xs">Speichern</Button>
              <Button onClick={handleLogout} variant="outline" className="w-full h-9 text-xs border-gray-600 text-white hover:bg-gray-800"><LogOut className="w-3 h-3 mr-2" /> Abmelden</Button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginPrompt && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-lg p-4 max-w-[200px] text-center">
            <Github className="w-8 h-8 mx-auto text-white mb-2" />
            <p className="text-white text-sm mb-3">Anmeldung erforderlich</p>
            <Button onClick={() => window.location.href = "/api/auth/github"} className="w-full text-xs" size="sm">
              Mit GitHub anmelden
            </Button>
            <Button onClick={() => setShowLoginPrompt(false)} variant="ghost" className="w-full text-xs text-gray-400 mt-2" size="sm">
              Später
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function createMicrophoneBitmap(): LEDBitmap {
  const bitmap: LEDBitmap = Array(16).fill(null).map(() => Array(16).fill(null).map(() => ({ color: "#000000", brightness: 0 })));
  const white = { color: "#FFFFFF", brightness: 1.0 };
  for (let row = 4; row <= 9; row++) for (let col = 6; col <= 9; col++) bitmap[row][col] = white;
  for (let row = 10; row <= 12; row++) { bitmap[row][7] = white; bitmap[row][8] = white; }
  for (let col = 5; col <= 10; col++) bitmap[13][col] = white;
  return bitmap;
}