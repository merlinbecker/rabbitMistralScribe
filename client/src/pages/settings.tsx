import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { UserSettings, GitHubRepo, UpdateUserSettings } from '@shared/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Settings() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');

  // Fetch user settings
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useQuery<UserSettings>({
    queryKey: ['/api/settings'],
    retry: 2,
  });

  // Fetch GitHub repos
  const { data: repos = [], isLoading: reposLoading, error: reposError } = useQuery<GitHubRepo[]>({
    queryKey: ['/api/github/repos'],
    retry: 2,
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: UpdateUserSettings) => {
      return await apiRequest('PATCH', '/api/settings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: 'Einstellungen gespeichert',
        description: 'Ihre Änderungen wurden erfolgreich gespeichert.',
      });
    },
    onError: () => {
      toast({
        title: 'Fehler',
        description: 'Einstellungen konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    const repoData = selectedRepo ? selectedRepo.split('/') : null;
    
    updateSettingsMutation.mutate({
      mistralApiKey: apiKey || settings?.mistralApiKey,
      githubRepoOwner: repoData ? repoData[0] : settings?.githubRepoOwner,
      githubRepoName: repoData ? repoData[1] : settings?.githubRepoName,
    });
  };

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
        <h1 className="text-body font-bold">Einstellungen</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <Card className="p-3">
          <div className="space-y-3">
            <div>
              <Label htmlFor="mistral-key" className="text-caption font-medium">
                Mistral API-Schlüssel
              </Label>
              <p className="text-caption text-muted-foreground mb-2">
                Für Transkription und Zusammenfassung
              </p>
              <Input
                id="mistral-key"
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 text-body"
                data-testid="input-mistral-key"
              />
              <a
                href="https://console.mistral.ai/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                API-Schlüssel erstellen
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {settings?.mistralApiKey && !apiKey && (
              <p className="text-caption text-muted-foreground bg-muted p-2 rounded-md">
                <Check className="w-3 h-3 inline mr-1" />
                API-Schlüssel ist gespeichert
              </p>
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="space-y-3">
            <div>
              <Label htmlFor="github-repo" className="text-caption font-medium">
                GitHub Repository
              </Label>
              <p className="text-caption text-muted-foreground mb-2">
                Wo Notizen gespeichert werden
              </p>
              
              {reposLoading ? (
                <div className="h-9 bg-muted animate-pulse rounded-md" />
              ) : (
                <Select 
                  value={selectedRepo || `${settings?.githubRepoOwner}/${settings?.githubRepoName}`}
                  onValueChange={setSelectedRepo}
                >
                  <SelectTrigger 
                    id="github-repo" 
                    className="h-9 text-body"
                    data-testid="select-github-repo"
                  >
                    <SelectValue placeholder="Repository auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((repo) => (
                      <SelectItem 
                        key={repo.id} 
                        value={repo.full_name}
                        data-testid={`repo-option-${repo.name}`}
                      >
                        {repo.full_name}
                        {repo.private && ' 🔒'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {settings?.githubRepoOwner && settings?.githubRepoName && !selectedRepo && (
              <p className="text-caption text-muted-foreground bg-muted p-2 rounded-md">
                <Check className="w-3 h-3 inline mr-1" />
                {settings.githubRepoOwner}/{settings.githubRepoName}
              </p>
            )}
          </div>
        </Card>

        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending || settingsLoading}
          className="w-full h-10"
          data-testid="button-save-settings"
        >
          {updateSettingsMutation.isPending ? 'Speichern...' : 'Einstellungen speichern'}
        </Button>
      </div>
    </div>
  );
}
