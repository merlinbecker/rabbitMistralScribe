export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });
    
    console.log('Service Worker registered successfully:', registration.scope);

    registration.addEventListener('updatefound', () => {
      console.log('Service Worker update found');
    });

    // Register for background sync if supported
    if ('sync' in registration) {
      try {
        await (registration as any).sync.register('sync-recordings');
        console.log('Background sync registered');
      } catch (syncError) {
        console.log('Background sync not supported:', syncError);
      }
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
    // Log more details
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}
