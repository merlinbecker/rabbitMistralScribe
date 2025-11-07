import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Recording } from '@shared/schema';
import { Clock, CheckCircle2, Loader2, AlertCircle, Mic } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface RecordingsListProps {
  recordings: Recording[];
  isLoading?: boolean;
}

export function RecordingsList({ recordings, isLoading }: RecordingsListProps) {
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
      <h3 className="text-body font-medium mb-2">Letzte Aufnahmen</h3>
      
      {recordings.slice(0, 5).map((recording) => (
        <Card 
          key={recording.id} 
          className="p-3 hover-elevate cursor-pointer"
          data-testid={`recording-item-${recording.id}`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-caption text-muted-foreground">
              {recording.createdAt ? formatDistanceToNow(new Date(recording.createdAt), { 
                addSuffix: true, 
                locale: de 
              }) : 'Unbekannt'}
            </span>
            {getStatusBadge(recording.status)}
          </div>
          
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
      ))}
    </div>
  );
}
