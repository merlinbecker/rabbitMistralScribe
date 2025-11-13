
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordingsList } from '@/components/RecordingsList';
import { useRequireApiKey } from '@/hooks/useRequireApiKey';
import { Recording } from '@shared/schema';
import { ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';
import { indexedDB } from '@/lib/indexedDB';

export default function Recordings() {
  // Check if API key is configured and redirect to settings if not
  useRequireApiKey();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch server recordings
  const { data: serverRecordings = [], isLoading } = useQuery<Recording[]>({
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
        userId: '',
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
    refetchInterval: 2000,
  });

  // Merge server and local recordings
  const recordings = React.useMemo(() => {
    const uniqueLocalRecordings = localRecordings.filter(
      local => !serverRecordings.some(server => server.id === local.id)
    );
    return [...uniqueLocalRecordings, ...serverRecordings];
  }, [serverRecordings, localRecordings]);

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
        r.summary?.toLowerCase().includes(query) ||
        r.title?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [recordings, searchQuery, statusFilter]);

  return (
    <div className="h-screen flex flex-col bg-background max-w-[240px] mx-auto">
      <div className="h-12 px-3 flex items-center gap-2 border-b border-border">
        <Link href="/">
          <Button 
            variant="ghost" 
            size="icon"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-body font-bold">Alle Aufnahmen</h1>
      </div>

      <div className="p-3 space-y-3 border-b border-border">
        {/* Search */}
        <div className="relative">
          <Input
            type="text"
            placeholder="Notizen durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-8 text-body"
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

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full" data-testid="select-status-filter">
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <RecordingsList recordings={filteredRecordings} isLoading={isLoading} showOnlyOne={false} />
      </div>
    </div>
  );
}
