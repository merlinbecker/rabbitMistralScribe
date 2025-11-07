import { Button } from '@/components/ui/button';
import { SiGithub } from 'react-icons/si';
import { Mic } from 'lucide-react';

export default function Auth() {
  const handleGitHubLogin = () => {
    window.location.href = '/api/auth/github';
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background max-w-[240px] mx-auto p-6">
      <div className="space-y-6 w-full text-center">
        <div className="space-y-2">
          <div className="w-16 h-16 mx-auto bg-primary rounded-lg flex items-center justify-center mb-4">
            <Mic className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-status font-bold">Audio Notes</h1>
          <p className="text-body text-muted-foreground">
            Aufnehmen, transkribieren und in GitHub speichern
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <Button
            onClick={handleGitHubLogin}
            className="w-full h-12 text-body gap-2"
            data-testid="button-github-login"
          >
            <SiGithub className="w-5 h-5" />
            Mit GitHub anmelden
          </Button>

          <p className="text-caption text-muted-foreground">
            Wir benötigen Zugriff auf Ihre GitHub-Repositories, um Notizen zu speichern
          </p>
        </div>
      </div>
    </div>
  );
}
