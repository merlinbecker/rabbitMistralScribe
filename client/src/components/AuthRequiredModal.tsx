/**
 * AuthRequiredModal - Modal displayed when authentication is required
 * Listens to auth:required events from SyncMiddleware
 */

import { useEffect, useState } from 'react';
import { useSyncMiddleware } from '@/contexts/SyncMiddlewareContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Github } from 'lucide-react';

/**
 * Modal that appears when a request requires authentication
 * Prompts user to login via GitHub OAuth
 */
export function AuthRequiredModal() {
  const { syncMiddleware } = useSyncMiddleware();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = syncMiddleware.getEventBus().on('auth:required', (data) => {
      setIsOpen(true);
      setPendingRequestId(data.requestId);
    });

    return unsubscribe;
  }, [syncMiddleware]);

  // Listen for successful auth to close modal
  useEffect(() => {
    const unsubscribe = syncMiddleware.getEventBus().on('auth:success', () => {
      setIsOpen(false);
      setPendingRequestId(null);
    });

    return unsubscribe;
  }, [syncMiddleware]);

  const handleLogin = () => {
    // Redirect to GitHub OAuth login
    window.location.href = '/api/auth/github';
  };

  const handleCancel = () => {
    setIsOpen(false);
    setPendingRequestId(null);
    // Emit auth failed event
    syncMiddleware.getEventBus().emit('auth:failed', { error: 'User cancelled login' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anmeldung erforderlich</DialogTitle>
          <DialogDescription>
            Bitte melden Sie sich an, um diese Aktion durchzuführen.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-6">
          <Github className="h-12 w-12 mb-4 text-muted-foreground" />
          <p className="text-sm text-center text-muted-foreground">
            Sie benötigen ein GitHub-Konto, um RabbitMistralScribe zu nutzen.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button onClick={handleLogin}>
            <Github className="mr-2 h-4 w-4" />
            Mit GitHub anmelden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
