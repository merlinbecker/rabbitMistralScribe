import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check, ExternalLink, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, clearStoredToken } from '@/lib/queryClient';
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
  const [, setLocation] = useLocation();
  const [apiKey, setApiKey] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [summaryTemplate, setSummaryTemplate] = useState('');
  
  const handleLogout = async () => {
    try {
      await apiRequest('POST', '/api/auth/logout');
      clearStoredToken();
      queryClient.clear();
      setLocation('/auth');
      toast({
        title: 'Abgemeldet',
        description: 'Sie wurden erfolgreich abgemeldet.',
      });
    } catch (error) {
      toast({
        title: 'Fehler',
        description: 'Abmeldung fehlgeschlagen.',
        variant: 'destructive',
      });
    }
  };

  // Fetch user settings
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useQuery<UserSettings>({
    queryKey: ['/api/settings'],
    retry: 2,
  });

  // Pre-fill summary template when settings load
  useEffect(() => {
    if (settings?.summaryTemplate && !summaryTemplate) {
      setSummaryTemplate(settings.summaryTemplate);
    }
  }, [settings, summaryTemplate]);

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
    
    const updates: UpdateUserSettings = {};
    
    console.log('[SETTINGS UI] Preparing to save:', {
      hasApiKeyInput: !!apiKey,
      apiKeyLength: apiKey.length,
      hasSelectedRepo: !!selectedRepo,
      hasSummaryTemplate: summaryTemplate !== ''
    });
    
    if (apiKey) updates.mistralApiKey = apiKey;
    if (repoData) {
      updates.githubRepoOwner = repoData[0];
      updates.githubRepoName = repoData[1];
    }
    if (summaryTemplate !== '') {
      updates.summaryTemplate = summaryTemplate;
    }
    
    console.log('[SETTINGS UI] Sending updates:', updates);
    
    updateSettingsMutation.mutate(updates);
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

        <Card className="p-3">
          <div className="space-y-3">
            <div>
              <Label htmlFor="summary-template" className="text-caption font-medium">
                Zusammenfassungs-Vorlage (optional)
              </Label>
              <p className="text-caption text-muted-foreground mb-2">
                Anweisungen für die KI-Zusammenfassung
              </p>
              <Textarea
                id="summary-template"
                placeholder="Standard: Du bist ein Assistent, der Audio-Notizen zusammenfasst. Erstelle eine strukturierte Zusammenfassung im Markdown-Format mit Hauptpunkten und wichtigen Details."
                value={summaryTemplate}
                onChange={(e) => setSummaryTemplate(e.target.value)}
                className="text-body min-h-[120px] resize-none"
                data-testid="textarea-summary-template"
              />
            </div>

            {settings?.summaryTemplate && !summaryTemplate && (
              <p className="text-caption text-muted-foreground bg-muted p-2 rounded-md">
                <Check className="w-3 h-3 inline mr-1" />
                Eigene Vorlage ist gespeichert
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
        
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full h-10 gap-2"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4" />
          Abmelden
        </Button>
      </div>
    </div>
  );
}
