import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { LEDPixelDisplay } from '@/components/LEDPixelDisplay';
import { ImageBitmapProvider } from '@/lib/ledBitmap';
import type { LEDBitmap } from '@/lib/ledBitmap';
import { setStoredToken } from '@/lib/queryClient';

export default function Auth() {
  const [, setLocation] = useLocation();
  const [githubBitmap, setGithubBitmap] = useState<LEDBitmap | null>(null);
  
  const setError = (message: string) => console.error(message);

  // Load GitHub logo bitmap on mount
  useEffect(() => {
    const loadGithubLogo = async () => {
      try {
        // Create a simple GitHub icon pattern (16x16)
        const githubPattern = [
          '0000011111100000',
          '0001111111111000',
          '0011111111111100',
          '0111111111111110',
          '1111110110111111',
          '1111110110111111',
          '1111111111111111',
          '1111111111111111',
          '1111111111111111',
          '0111111111111110',
          '0111111001111110',
          '0011110000111100',
          '0011100000011100',
          '0001100000001000',
          '0001000000001000',
          '0000000000000000'
        ];

        const bitmap: LEDBitmap = githubPattern.map(row => 
          row.split('').map(char => ({
            color: char === '1' ? '#FFFFFF' : '#000000',
            brightness: char === '1' ? 1.0 : 0
          }))
        );

        setGithubBitmap(bitmap);
      } catch (error) {
        console.error('Failed to create GitHub logo:', error);
      }
    };

    loadGithubLogo();
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
    } else if (token) {
      // Store token in localStorage using the helper function
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      setStoredToken(decodeURIComponent(token), expiresAt.toISOString());

      console.log('[AUTH] Token stored in localStorage');

      // Clean URL
      window.history.replaceState({}, '', '/');

      // Redirect to home
      setLocation('/');
    }
  }, [setLocation]);

  const handleGitHubLogin = () => {
    window.location.href = '/api/auth/github';
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background max-w-[240px] mx-auto p-6">
      <div className="space-y-6 w-full text-center">
        {githubBitmap && (
          <LEDPixelDisplay bitmap={githubBitmap} />
        )}

        <div className="space-y-3">
          <Button
            onClick={handleGitHubLogin}
            className="w-full h-12 text-body text-black"
            data-testid="button-github-login"
          >
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