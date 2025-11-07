export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered:', registration);

      // Register for background sync
      if ('sync' in registration) {
        await (registration as any).sync.register('sync-recordings');
        console.log('Background sync registered');
      }

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_RECORDINGS') {
          // Trigger recordings sync
          window.dispatchEvent(new CustomEvent('sync-recordings'));
        }
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}
