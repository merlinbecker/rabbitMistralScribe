import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { SiGithub } from 'react-icons/si';
import { Mic } from 'lucide-react';
import { setStoredToken } from '@/lib/queryClient';

export default function Auth() {
  const [, setLocation] = useLocation();
  // Assume setError and checkAuthStatus are defined elsewhere or passed as props
  // For this example, we'll mock them to avoid errors. In a real app, they'd be imported or defined.
  const setError = (message) => console.error(message);
  const checkAuthStatus = () => {
    console.log("Checking auth status...");
    // Placeholder for actual auth status check logic
    // In a real scenario, this would likely involve fetching user data
    // and setting the user state, then redirecting.
    setLocation('/');
  };


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authenticated = params.get('authenticated');
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      setError(
        error === 'no_code' ? 'Keine Autorisierung erhalten' :
        error === 'oauth_not_configured' ? 'GitHub OAuth nicht konfiguriert' :
        error === 'no_token' ? 'Kein Access Token erhalten' :
        error === 'oauth_failed' ? 'GitHub Authentifizierung fehlgeschlagen' :
        error === 'session_failed' ? 'Session konnte nicht erstellt werden' :
        'Ein Fehler ist aufgetreten'
      );
    } else if (authenticated === 'true' && token) {
      // Store token in localStorage
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      localStorage.setItem('auth_token', JSON.stringify({
        token: decodeURIComponent(token),
        expiresAt: expiresAt.toISOString()
      }));

      console.log('[AUTH] Token stored in localStorage');

      // Clean URL
      window.history.replaceState({}, '', '/');

      checkAuthStatus();
    }
  }, [checkAuthStatus, setLocation]); // Added setLocation to dependency array

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