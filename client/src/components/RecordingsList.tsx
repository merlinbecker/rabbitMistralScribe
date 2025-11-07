import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Recording } from '@shared/schema';
import { Clock, CheckCircle2, Loader2, AlertCircle, Mic, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface RecordingsListProps {
  recordings: Recording[];
  isLoading?: boolean;
}

export function RecordingsList({ recordings, isLoading }: RecordingsListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
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
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {recording.audioUrl && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => togglePlayback(recording)}
                    data-testid={`button-play-${recording.id}`}
                    className="flex-shrink-0"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <span className="text-caption text-muted-foreground truncate">
                  {recording.createdAt ? formatDistanceToNow(new Date(recording.createdAt), { 
                    addSuffix: true, 
                    locale: de 
                  }) : 'Unbekannt'}
                </span>
              </div>
              {getStatusBadge(recording.status)}
            </div>

            {isPlaying && (
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
            
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-caption text-muted-foreground">
                {formatDuration(recording.duration)}
              </span>
            </div>

            {recording.transcript && (
              <p className="text-body mt-2 line-clamp-2 text-foreground">
                {recording.transcript.substring(0, 100)}
                {recording.transcript.length > 100 && '...'}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
