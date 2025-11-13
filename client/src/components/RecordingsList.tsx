import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Recording } from '@shared/schema';
import { Clock, CheckCircle2, Loader2, AlertCircle, Mic, Play, Pause, Edit, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';

interface RecordingsListProps {
  recordings: Recording[];
  isLoading?: boolean;
}

export function RecordingsList({ recordings, isLoading }: RecordingsListProps) {
  const { toast } = useToast();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [editingRecording, setEditingRecording] = useState<Recording | null>(null);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateRecordingMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Recording> }) => {
      return await apiRequest('PATCH', `/api/recordings/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
      toast({
        title: 'Gespeichert',
        description: 'Die Änderungen wurden gespeichert.',
      });
      setEditingRecording(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Speichern fehlgeschlagen',
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (recording: Recording) => {
    setEditingRecording(recording);
    setEditedTranscript(recording.transcript || '');
    setEditedSummary(recording.summary || '');
  };

  const handleSaveEdit = () => {
    if (!editingRecording) return;
    
    updateRecordingMutation.mutate({
      id: editingRecording.id,
      updates: {
        transcript: editedTranscript,
        summary: editedSummary,
      },
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setPlayingId(null);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayback = (recording: Recording) => {
    if (!recording.audioUrl) return;

    if (playingId === recording.id) {
      // Pause
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      // Play
      if (audioRef.current) {
        audioRef.current.src = recording.audioUrl;
        audioRef.current.play();
        setPlayingId(recording.id);
      }
    }
  };

  const toggleTranscript = (recordingId: string) => {
    setExpandedTranscripts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recordingId)) {
        newSet.delete(recordingId);
      } else {
        newSet.add(recordingId);
      }
      return newSet;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'transcribed':
        return (
          <Badge variant="default" className="text-caption gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Transkribiert
          </Badge>
        );
      case 'transcribing':
        return (
          <Badge variant="secondary" className="text-caption gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Verarbeitung
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="text-caption gap-1">
            <AlertCircle className="w-3 h-3" />
            Fehler
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-caption gap-1">
            <Clock className="w-3 h-3" />
            Ausstehend
          </Badge>
        );
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="p-6 text-center" data-testid="empty-recordings">
        <Mic className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-body text-muted-foreground">Noch keine Aufnahmen</p>
        <p className="text-caption text-muted-foreground mt-1">
          Drücken Sie die Seitentaste zum Starten
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3 pb-20" data-testid="recordings-list">
      <audio ref={audioRef} className="hidden" />
      <h3 className="text-body font-medium mb-2">Letzte Aufnahmen</h3>
      
      {recordings.slice(0, 5).map((recording) => {
        const isPlaying = playingId === recording.id;
        const progress = isPlaying && recording.duration 
          ? (currentTime / recording.duration) * 100 
          : 0;

        return (
          <Card 
            key={recording.id} 
            className="p-3"
            data-testid={`recording-item-${recording.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-body font-medium mb-1 truncate" data-testid={`title-${recording.id}`}>
                  {recording.title || 'Audio-Notiz'}
                </h4>
                <div className="flex items-center gap-2">
                  {recording.audioUrl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => togglePlayback(recording)}
                      data-testid={`button-play-${recording.id}`}
                      className="flex-shrink-0 h-6 w-6"
                    >
                      {isPlaying ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </Button>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-caption text-muted-foreground">
                      {formatDuration(recording.duration)}
                    </span>
                  </div>
                  <span className="text-caption text-muted-foreground truncate">
                    • {recording.createdAt ? formatDistanceToNow(new Date(recording.createdAt), { 
                      addSuffix: true, 
                      locale: de 
                    }) : 'Unbekannt'}
                  </span>
                </div>
              </div>
              {getStatusBadge(recording.status)}
            </div>

            {/* Audio player for recordings with audio */}
            {recording.audioUrl && isPlaying && (
              <div className="mb-2">
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-100"
                    style={{ width: `${progress}%` }}
                    data-testid={`progress-bar-${recording.id}`}
                  />
                </div>
                <div className="flex justify-between text-caption text-muted-foreground mt-1">
                  <span data-testid={`current-time-${recording.id}`}>{formatDuration(Math.floor(currentTime))}</span>
                  <span data-testid={`duration-${recording.id}`}>{formatDuration(recording.duration)}</span>
                </div>
              </div>
            )}

            {/* Summary and transcript for transcribed recordings */}
            {recording.status === 'transcribed' && recording.transcript && (
              <div className="mt-2 space-y-2">
                {recording.summary && (
                  <p className="text-caption text-muted-foreground" data-testid={`summary-${recording.id}`}>
                    {recording.summary}
                  </p>
                )}
                
                <Collapsible
                  open={expandedTranscripts.has(recording.id)}
                  onOpenChange={() => toggleTranscript(recording.id)}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-caption"
                      data-testid={`button-toggle-transcript-${recording.id}`}
                    >
                      <span>Transkript anzeigen</span>
                      {expandedTranscripts.has(recording.id) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="bg-muted/50 rounded-md p-2 text-caption" data-testid={`transcript-${recording.id}`}>
                      {recording.transcript}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(recording)}
                        data-testid={`button-edit-${recording.id}`}
                        className="flex-1"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Bearbeiten
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Show summary only for non-transcribed recordings that have one */}
            {recording.status !== 'transcribed' && recording.summary && (
              <p className="text-caption mt-2 line-clamp-2 text-muted-foreground" data-testid={`summary-${recording.id}`}>
                {recording.summary.substring(0, 120)}
                {recording.summary.length > 120 && '...'}
              </p>
            )}
          </Card>
        );
      })}

      <Dialog open={!!editingRecording} onOpenChange={(open) => !open && setEditingRecording(null)}>
        <DialogContent className="max-w-[220px]">
          <DialogHeader>
            <DialogTitle>Notiz bearbeiten</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-transcript" className="text-caption">Transkript</Label>
              <Textarea
                id="edit-transcript"
                value={editedTranscript}
                onChange={(e) => setEditedTranscript(e.target.value)}
                className="text-caption min-h-[80px] mt-1"
                data-testid="input-edit-transcript"
              />
            </div>
            
            <div>
              <Label htmlFor="edit-summary" className="text-caption">Zusammenfassung</Label>
              <Textarea
                id="edit-summary"
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="text-caption min-h-[80px] mt-1"
                data-testid="input-edit-summary"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingRecording(null)}
              data-testid="button-cancel-edit"
              size="sm"
            >
              <X className="w-3 h-3 mr-1" />
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateRecordingMutation.isPending}
              data-testid="button-save-edit"
              size="sm"
            >
              {updateRecordingMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
