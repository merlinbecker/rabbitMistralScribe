/**
 * SettingsRequiredModal - Modal displayed when required settings are missing
 * Listens to settings:required events from SyncMiddleware
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
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
import { Settings, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * Modal that appears when a request requires settings that are not configured
 * Prompts user to configure required settings (e.g., Mistral API key)
 */
export function SettingsRequiredModal() {
  const { syncMiddleware } = useSyncMiddleware();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [missingSettings, setMissingSettings] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = syncMiddleware.getEventBus().on('settings:required', (data) => {
      setIsOpen(true);
      setPendingRequestId(data.requestId);
      setMissingSettings(data.missing);
    });

    return unsubscribe;
  }, [syncMiddleware]);

  // Listen for settings update to close modal
  useEffect(() => {
    const unsubscribe = syncMiddleware.getEventBus().on('settings:updated', () => {
      setIsOpen(false);
      setPendingRequestId(null);
      setMissingSettings([]);
    });

    return unsubscribe;
  }, [syncMiddleware]);

  const handleGoToSettings = () => {
    setIsOpen(false);
    setLocation('/settings');
  };

  const handleCancel = () => {
    setIsOpen(false);
    setPendingRequestId(null);
    setMissingSettings([]);
  };

  const getMissingSettingsText = () => {
    if (missingSettings.includes('mistralApiKey')) {
      return 'Mistral API Key';
    }
    return missingSettings.join(', ');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Einstellungen erforderlich</DialogTitle>
          <DialogDescription>
            Bitte konfigurieren Sie die erforderlichen Einstellungen, um fortzufahren.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col items-center justify-center">
            <Settings className="h-12 w-12 mb-4 text-muted-foreground" />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Folgende Einstellungen fehlen: <strong>{getMissingSettingsText()}</strong>
            </AlertDescription>
          </Alert>

          <p className="text-sm text-center text-muted-foreground">
            Für diese Aktion ist ein konfigurierter Mistral API Key erforderlich.
            Bitte fügen Sie Ihren API Key in den Einstellungen hinzu.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button onClick={handleGoToSettings}>
            <Settings className="mr-2 h-4 w-4" />
            Zu den Einstellungen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
