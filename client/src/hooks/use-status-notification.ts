import { useState, useEffect, useCallback, useRef } from 'react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface StatusNotification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  duration?: number; // in milliseconds, default 10000
}

interface NotificationState {
  queue: StatusNotification[];
  current: StatusNotification | null;
}

let globalListeners: Array<(state: NotificationState) => void> = [];
let globalState: NotificationState = {
  queue: [],
  current: null,
};
let currentTimeoutId: ReturnType<typeof setTimeout> | null = null;
let notificationCounter = 0;

function generateId(): string {
  return `notification-${Date.now()}-${notificationCounter++}`;
}

function processQueue() {
  // If already showing a notification, don't process
  if (globalState.current) {
    return;
  }

  // Get next notification from queue
  if (globalState.queue.length > 0) {
    const nextNotification = globalState.queue[0];
    globalState = {
      queue: globalState.queue.slice(1),
      current: nextNotification,
    };

    notifyListeners();

    // Set timeout to clear current notification
    const duration = nextNotification.duration || 10000;
    currentTimeoutId = setTimeout(() => {
      clearCurrentNotification();
    }, duration);
  }
}

function clearCurrentNotification() {
  if (currentTimeoutId) {
    clearTimeout(currentTimeoutId);
    currentTimeoutId = null;
  }

  globalState = {
    ...globalState,
    current: null,
  };

  notifyListeners();

  // Process next notification in queue
  processQueue();
}

function notifyListeners() {
  globalListeners.forEach((listener) => listener(globalState));
}

export function showStatusNotification(notification: Omit<StatusNotification, 'id'>): string {
  const id = generateId();
  const fullNotification: StatusNotification = {
    ...notification,
    id,
  };

  globalState = {
    ...globalState,
    queue: [...globalState.queue, fullNotification],
  };

  notifyListeners();

  // Try to process queue immediately if nothing is showing
  if (!globalState.current) {
    processQueue();
  }

  return id;
}

export function dismissStatusNotification(id?: string) {
  if (id) {
    // Remove from queue if it's there
    globalState = {
      ...globalState,
      queue: globalState.queue.filter((n) => n.id !== id),
    };

    // If it's the current notification, clear it
    if (globalState.current?.id === id) {
      clearCurrentNotification();
    } else {
      notifyListeners();
    }
  } else {
    // Dismiss current notification
    clearCurrentNotification();
  }
}

// For testing purposes - allows resetting the global state
export function resetStatusNotifications() {
  if (currentTimeoutId) {
    clearTimeout(currentTimeoutId);
    currentTimeoutId = null;
  }
  globalState = {
    queue: [],
    current: null,
  };
  notifyListeners();
}

export function useStatusNotification() {
  const [state, setState] = useState<NotificationState>(globalState);

  useEffect(() => {
    globalListeners.push(setState);

    return () => {
      const index = globalListeners.indexOf(setState);
      if (index > -1) {
        globalListeners.splice(index, 1);
      }
    };
  }, []);

  const notify = useCallback(
    (notification: Omit<StatusNotification, 'id'>) => {
      return showStatusNotification(notification);
    },
    []
  );

  const dismiss = useCallback((id?: string) => {
    dismissStatusNotification(id);
  }, []);

  return {
    current: state.current,
    queue: state.queue,
    notify,
    dismiss,
  };
}
