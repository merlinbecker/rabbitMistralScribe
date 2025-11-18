# SyncMiddleware - Backend Communication & Authentication Service

**Version:** 1.0  
**Datum:** 2025-11-18  
**Status:** Konzept/Planung  
**Autor:** AI-basierte Architekturplanung

---

## 1. Executive Summary

Dieses Dokument beschreibt das Konzept für eine neue Frontend-Komponente **SyncMiddleware**, die als vereinheitlichte Abstraktionsschicht um TanStack Query alle Backend-Kommunikation, Authentifizierung und State-Management für Requests in RabbitMistralScribe zentralisiert.

### Kernziele
- ✅ Vollständige Vereinheitlichung mit TanStack Query (Wrapper für alle Requests)
- ✅ Zentralisierung aller Backend-Kommunikation (Queries + Mutations)
- ✅ Automatische Token-Validierung und Login-Flow für **alle** Operationen
- ✅ Settings-Validierung (Mistral API Key) vor kritischen Requests
- ✅ Event-basierte Architektur mit Request Queue
- ✅ Offline-First Support mit automatischer Sync
- ✅ Reduktion von Code-Duplikation und konsistente Developer-Experience

---

## 2. Problemanalyse

### 2.1 Aktuelle Situation

**Vorhandene Implementierung:**
- ✅ Bearer Token Authentication über `queryClient.ts`
- ✅ Token Storage in localStorage mit Expiry
- ✅ TanStack Query für API-Requests
- ✅ IndexedDB für Offline-Storage
- ✅ `useRequireApiKey` Hook für Settings-Check

**Probleme:**
1. **Code-Duplikation:** Auth-Check und Settings-Validation an mehreren Stellen
2. **Fehlende Zentralisierung:** Verschiedene Komponenten führen ähnliche Prüfungen durch
3. **Manuelle Queue-Verwaltung:** Upload-Logic direkt in `rabbit.tsx` eingebettet
4. **Unklare Fehlerbehandlung:** 401-Errors werden individuell behandelt
5. **Keine konsistente Event-Kommunikation:** Callback-basiert statt Event-basiert
6. **Inkonsistente API:** TanStack Query für GET, manuelle Fetch-Calls für POST/PATCH/DELETE

### 2.2 Anforderungen aus Issue

#### Funktionale Anforderungen
- **F1:** Nutzer-Token-Validierung vor jedem Backend-Request
- **F2:** Automatischer Login-Screen bei fehlendem/abgelaufenem Token
- **F3:** Settings-Validierung (Mistral API Key) vor kritischen Operationen
- **F4:** Event-basierte Request/Response-Kommunikation
- **F5:** Request-Queueing für asynchrone Backend-Calls
- **F6:** Nur Ausführung wenn Gerät online ist
- **F7:** Keine Requests während aktiver Aufnahme

#### Nicht-Funktionale Anforderungen
- **NF1:** Minimaler Overhead (< 50ms pro Request)
- **NF2:** Testbarkeit durch Dependency Injection
- **NF3:** Type-Safety mit TypeScript
- **NF4:** Vollständige Integration mit TanStack Query (vereinheitlichter Ansatz)
- **NF5:** Keine Breaking Changes an existierendem Code

---

## 3. Lösungsarchitektur

### 3.1 Komponenten-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Components                       │
│  (rabbit.tsx, RecordingsList.tsx, Settings.tsx, etc.)       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Events & Requests
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    SyncMiddleware                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ EventBus     │  │ RequestQueue │  │ AuthValidator    │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ SettingsVal. │  │ NetworkCheck │  │ RecordingCheck   │ │
│  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Validated Requests
                      ▼
┌─────────────────────────────────────────────────────────────┐
│           Unified Backend Communication Layer                │
│    SyncMiddleware wraps TanStack Query + IndexedDB          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Kern-Module

#### 3.2.1 EventBus (Event-Verwaltung)

**Zweck:** Zentrale Event-Kommunikation zwischen Komponenten

**Verantwortlichkeiten:**
- Event Registration/Deregistration
- Event Emission mit Type-Safety
- Event-Listener-Verwaltung
- Error-Boundary für Event-Handler

**Events:**
```typescript
type SyncEvents = {
  // Request Events
  'request:enqueue': { id: string; type: RequestType; payload: any };
  'request:start': { id: string };
  'request:success': { id: string; data: any };
  'request:error': { id: string; error: Error };
  
  // Auth Events
  'auth:required': { requestId: string };
  'auth:success': { userId: string };
  'auth:failed': { error: string };
  
  // Settings Events
  'settings:required': { requestId: string; missing: string[] };
  'settings:updated': { settings: UserSettings };
  
  // State Events
  'online:changed': { online: boolean };
  'recording:changed': { recording: boolean };
};
```

**API:**
```typescript
interface IEventBus {
  on<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): () => void;
  emit<K extends keyof SyncEvents>(event: K, data: SyncEvents[K]): void;
  off<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): void;
  once<K extends keyof SyncEvents>(event: K, handler: (data: SyncEvents[K]) => void): void;
}
```

#### 3.2.2 RequestQueue (Request-Verwaltung)

**Zweck:** Asynchrone Request-Verarbeitung mit Priorität und Retry-Logic

**Verantwortlichkeiten:**
- Request-Queueing nach Priorität
- Retry-Logic bei Fehlern (exponential backoff)
- Parallel-Limitierung (max 3 gleichzeitige Requests)
- Status-Tracking für jeden Request

**Request-Typen mit Priorität:**
```typescript
enum RequestPriority {
  HIGH = 1,    // Upload, Settings Update
  MEDIUM = 2,  // Fetch Settings, Recordings
  LOW = 3      // Background Sync
}

interface QueuedRequest {
  id: string;
  type: RequestType;
  priority: RequestPriority;
  payload: any;
  retries: number;
  maxRetries: number;
  timestamp: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}
```

**Verarbeitungs-Pipeline:**
1. Request wird in Queue eingereiht
2. Validation-Chain wird durchlaufen (siehe 3.2.3)
3. Bei Success: Request an Backend
4. Bei Failure: Retry mit Backoff oder User-Notification
5. Ergebnis wird als Event emitted

#### 3.2.3 Validation Chain

**Zweck:** Sequenzielle Prüfung aller Voraussetzungen

**Reihenfolge:**
```typescript
interface Validator {
  name: string;
  validate(request: QueuedRequest): Promise<ValidationResult>;
}

const validationChain: Validator[] = [
  OnlineValidator,      // Prüft Netzwerk-Status
  RecordingValidator,   // Prüft ob Aufnahme läuft
  AuthValidator,        // Prüft Token-Gültigkeit
  SettingsValidator,    // Prüft Mistral API Key (nur bei kritischen Requests)
];
```

**1. OnlineValidator**
```typescript
class OnlineValidator implements Validator {
  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const isOnline = navigator.onLine;
    if (!isOnline) {
      return { 
        valid: false, 
        action: 'defer',  // Request bleibt in Queue
        reason: 'Device is offline' 
      };
    }
    return { valid: true };
  }
}
```

**2. RecordingValidator**
```typescript
class RecordingValidator implements Validator {
  constructor(private recordingState: () => boolean) {}
  
  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const isRecording = this.recordingState();
    if (isRecording) {
      return { 
        valid: false, 
        action: 'defer',
        reason: 'Recording in progress' 
      };
    }
    return { valid: true };
  }
}
```

**3. AuthValidator**
```typescript
class AuthValidator implements Validator {
  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const token = getStoredToken();
    
    if (!token) {
      eventBus.emit('auth:required', { requestId: request.id });
      return { 
        valid: false, 
        action: 'wait',  // Pausiert bis Token verfügbar
        reason: 'Authentication required' 
      };
    }
    
    // Optional: Token-Validität prüfen (nur Expiry, nicht Server-Call)
    const isExpired = isTokenExpired(token);
    if (isExpired) {
      clearStoredToken();
      eventBus.emit('auth:required', { requestId: request.id });
      return { 
        valid: false, 
        action: 'wait',
        reason: 'Token expired' 
      };
    }
    
    return { valid: true };
  }
}
```

**4. SettingsValidator**
```typescript
class SettingsValidator implements Validator {
  constructor(private getSettings: () => Promise<UserSettings | null>) {}
  
  async validate(request: QueuedRequest): Promise<ValidationResult> {
    // Nur für kritische Request-Typen (Upload, Transcription)
    if (!request.requiresSettings) {
      return { valid: true };
    }
    
    const settings = await this.getSettings();
    
    if (!settings?.mistralApiKey) {
      eventBus.emit('settings:required', { 
        requestId: request.id,
        missing: ['mistralApiKey'] 
      });
      return { 
        valid: false, 
        action: 'wait',
        reason: 'Mistral API key required' 
      };
    }
    
    return { valid: true };
  }
}
```

### 3.3 Vereinheitlichte Integration mit TanStack Query

**Ansatz:** SyncMiddleware als zentrale Abstraktionsschicht für **alle** Backend-Kommunikation

**Lösung:** Vollständige Integration - SyncMiddleware wraps TanStack Query für alle Operationen

```typescript
// ALLE Operationen (Queries + Mutations) über SyncMiddleware
// Upload mit voller Validation
const { execute: upload } = useSyncRequest('upload', {
  priority: RequestPriority.HIGH,
  requiresSettings: true,
  requiresAuth: true
});

// GET-Requests mit automatischer Auth-Validation
const { data, isLoading } = useSyncQuery('/api/recordings', {
  requiresAuth: true,
  priority: RequestPriority.MEDIUM
});

// Settings-Update
const { execute: updateSettings } = useSyncRequest('settings:update', {
  priority: RequestPriority.HIGH,
  requiresAuth: true
});
```

**Architektur-Layer:**
```typescript
class SyncMiddleware {
  private queryClient: QueryClient;
  
  // Wrapper für TanStack Queries (GET-Requests)
  createQuery<T>(
    queryKey: QueryKey,
    queryFn: QueryFunction<T>,
    options: SyncQueryOptions
  ): UseQueryResult<T> {
    // Validation vor Query-Ausführung
    const validatedQueryFn: QueryFunction<T> = async (context) => {
      await this.runValidationChain(options);
      return queryFn(context);
    };
    
    return useQuery({
      queryKey,
      queryFn: validatedQueryFn,
      enabled: options.enabled && this.canExecute(options),
      ...options.queryOptions
    });
  }
  
  // Wrapper für TanStack Mutations (POST, PATCH, DELETE)
  createMutation<TData, TVariables>(
    mutationFn: MutationFunction<TData, TVariables>,
    options: SyncMutationOptions
  ): UseMutationResult<TData, TVariables> {
    const validatedMutationFn = async (variables: TVariables) => {
      // Request in Queue einreihen mit Validation
      return this.enqueueRequest({
        type: options.type,
        priority: options.priority,
        payload: variables,
        requiresSettings: options.requiresSettings,
        requiresAuth: options.requiresAuth,
        executor: () => mutationFn(variables)
      });
    };
    
    return useMutation({
      mutationFn: validatedMutationFn,
      onSuccess: (data) => {
        // Event emittieren
        this.eventBus.emit('request:success', { 
          id: options.type, 
          data 
        });
        options.onSuccess?.(data);
      },
      ...options.mutationOptions
    });
  }
  
  // Low-level API für komplexe Fälle
  async enqueueRequest<T>(options: EnqueueOptions): Promise<T> {
    // ... existing implementation
  }
}
```

### 3.4 React Hook Interface (Vereinheitlicht)

**Ziel:** Konsistente API für alle Backend-Operationen basierend auf TanStack Query

```typescript
// Hook für GET-Requests (ersetzt useQuery)
function useSyncQuery<TData = unknown>(
  queryKey: QueryKey,
  options?: {
    requiresAuth?: boolean;
    requiresSettings?: boolean;
    priority?: RequestPriority;
    enabled?: boolean;
    queryOptions?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>;
  }
): UseQueryResult<TData> {
  const syncMiddleware = useSyncMiddleware();
  
  return syncMiddleware.createQuery<TData>(
    queryKey,
    async () => {
      // Validation wird automatisch durchgeführt
      const url = Array.isArray(queryKey) ? queryKey.join('/') : queryKey;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${getStoredToken()}`
        }
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return response.json();
    },
    options
  );
}

// Hook für Mutations (ersetzt useMutation)
function useSyncMutation<TData = unknown, TVariables = unknown>(
  type: RequestType,
  mutationFn: MutationFunction<TData, TVariables>,
  options?: {
    priority?: RequestPriority;
    requiresSettings?: boolean;
    requiresAuth?: boolean;
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    mutationOptions?: Omit<UseMutationOptions<TData, TVariables>, 'mutationFn'>;
  }
): UseMutationResult<TData, TVariables> {
  const syncMiddleware = useSyncMiddleware();
  
  return syncMiddleware.createMutation<TData, TVariables>(
    mutationFn,
    {
      type,
      priority: options?.priority || RequestPriority.MEDIUM,
      requiresSettings: options?.requiresSettings || false,
      requiresAuth: options?.requiresAuth ?? true,
      onSuccess: options?.onSuccess,
      onError: options?.onError,
      mutationOptions: options?.mutationOptions
    }
  );
}

// Vereinfachter Hook für häufige Operationen (Convenience-Wrapper)
function useSyncRequest<TData = unknown, TPayload = unknown>(
  type: RequestType,
  options?: {
    priority?: RequestPriority;
    requiresSettings?: boolean;
    requiresAuth?: boolean;
  }
) {
  const mutation = useSyncMutation<TData, TPayload>(
    type,
    async (payload: TPayload) => {
      // Default implementation - kann überschrieben werden
      const response = await apiRequest('POST', `/api/${type}`, payload);
      return response as TData;
    },
    options
  );
  
  return {
    execute: mutation.mutate,
    executeAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    data: mutation.data,
    error: mutation.error
  };
}

// Usage Examples - Vereinheitlichte API
function RecordingsComponent() {
  // GET-Request mit automatischer Auth-Validation
  const { data: recordings, isLoading } = useSyncQuery<Recording[]>('/api/recordings', {
    requiresAuth: true,
    priority: RequestPriority.MEDIUM
  });
  
  // Upload mit voller Validation (POST)
  const { execute: uploadRecording, isLoading: isUploading } = useSyncRequest('upload', {
    priority: RequestPriority.HIGH,
    requiresSettings: true,
    requiresAuth: true
  });
  
  // Settings-Update (PATCH)
  const updateSettings = useSyncMutation<UserSettings, UpdateUserSettings>(
    'settings:update',
    async (settings) => apiRequest('PATCH', '/api/settings', settings),
    {
      priority: RequestPriority.HIGH,
      requiresAuth: true,
      onSuccess: () => console.log('Settings updated')
    }
  );
  
  const handleUpload = async () => {
    await uploadRecording({ audioBlob, recordingId });
  };
  
  const handleSettingsUpdate = () => {
    updateSettings.mutate({ mistralApiKey: 'new-key' });
  };
  
  return (
    <div>
      {isLoading ? <Spinner /> : <RecordingsList recordings={recordings} />}
      <button onClick={handleUpload} disabled={isUploading}>Upload</button>
      <button onClick={handleSettingsUpdate}>Update Settings</button>
    </div>
  );
}
```

### 3.5 UI-Integration für Auth und Settings

**Login-Modal:**
```typescript
// React-Komponente reagiert auf auth:required Event
function AuthRequiredModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  
  useEffect(() => {
    const unsubscribe = eventBus.on('auth:required', (data) => {
      setIsOpen(true);
      setPendingRequestId(data.requestId);
    });
    return unsubscribe;
  }, []);
  
  const handleLoginSuccess = () => {
    setIsOpen(false);
    eventBus.emit('auth:success', { userId: getStoredToken()! });
    // SyncMiddleware nimmt Queue-Verarbeitung automatisch wieder auf
  };
  
  return (
    <Dialog open={isOpen}>
      <DialogContent>
        <h2>Login Required</h2>
        <p>Please login to continue</p>
        <Button onClick={() => window.location.href = '/api/auth/github'}>
          Login with GitHub
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

**Settings-Modal:**
```typescript
// Analog zu AuthRequiredModal
function SettingsRequiredModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [missingSettings, setMissingSettings] = useState<string[]>([]);
  
  useEffect(() => {
    const unsubscribe = eventBus.on('settings:required', (data) => {
      setIsOpen(true);
      setMissingSettings(data.missing);
    });
    return unsubscribe;
  }, []);
  
  const handleSettingsSaved = (settings: UserSettings) => {
    setIsOpen(false);
    eventBus.emit('settings:updated', { settings });
  };
  
  return (
    <Dialog open={isOpen}>
      <DialogContent>
        <h2>Settings Required</h2>
        <p>Please configure: {missingSettings.join(', ')}</p>
        <SettingsForm onSave={handleSettingsSaved} />
      </DialogContent>
    </Dialog>
  );
}
```

---

## 4. Implementierungs-Details

### 4.1 Dateistruktur

```
client/src/
├── services/
│   ├── syncMiddleware/
│   │   ├── index.ts                    # Main export
│   │   ├── SyncMiddleware.ts           # Core service class
│   │   ├── EventBus.ts                 # Event management
│   │   ├── RequestQueue.ts             # Queue implementation
│   │   ├── validators/
│   │   │   ├── index.ts
│   │   │   ├── OnlineValidator.ts
│   │   │   ├── RecordingValidator.ts
│   │   │   ├── AuthValidator.ts
│   │   │   └── SettingsValidator.ts
│   │   └── types.ts                    # TypeScript interfaces
│   └── syncMiddlewareInstance.ts       # Singleton instance
├── hooks/
│   ├── useSyncRequest.ts               # React hook
│   └── useSyncMiddleware.ts            # Context hook
├── components/
│   ├── AuthRequiredModal.tsx
│   └── SettingsRequiredModal.tsx
└── contexts/
    └── SyncMiddlewareContext.tsx       # React Context
```

### 4.2 Kern-Implementierung

**SyncMiddleware.ts:**
```typescript
export class SyncMiddleware {
  private eventBus: EventBus;
  private requestQueue: RequestQueue;
  private validators: Validator[];
  private isProcessing: boolean = false;
  
  constructor(
    private getSettings: () => Promise<UserSettings | null>,
    private isRecording: () => boolean
  ) {
    this.eventBus = new EventBus();
    this.requestQueue = new RequestQueue();
    this.validators = [
      new OnlineValidator(),
      new RecordingValidator(isRecording),
      new AuthValidator(),
      new SettingsValidator(getSettings)
    ];
    
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Resume processing when online
    window.addEventListener('online', () => {
      this.eventBus.emit('online:changed', { online: true });
      this.processQueue();
    });
    
    // Pause when offline
    window.addEventListener('offline', () => {
      this.eventBus.emit('online:changed', { online: false });
    });
    
    // Resume after auth success
    this.eventBus.on('auth:success', () => {
      this.processQueue();
    });
    
    // Resume after settings update
    this.eventBus.on('settings:updated', () => {
      this.processQueue();
    });
  }
  
  async enqueueRequest<T>(options: EnqueueOptions): Promise<T> {
    const request: QueuedRequest = {
      id: generateRequestId(),
      type: options.type,
      priority: options.priority || RequestPriority.MEDIUM,
      payload: options.payload,
      requiresSettings: options.requiresSettings || false,
      retries: 0,
      maxRetries: options.maxRetries || 3,
      timestamp: Date.now(),
      status: 'queued',
      executor: options.executor
    };
    
    this.requestQueue.enqueue(request);
    this.eventBus.emit('request:enqueue', { 
      id: request.id, 
      type: request.type, 
      payload: request.payload 
    });
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    // Return promise that resolves when request completes
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        this.eventBus.off('request:success', successHandler);
        this.eventBus.off('request:error', errorHandler);
      };
      
      const successHandler = (data: { id: string; data: T }) => {
        if (data.id === request.id) {
          cleanup();
          resolve(data.data);
        }
      };
      
      const errorHandler = (data: { id: string; error: Error }) => {
        if (data.id === request.id) {
          cleanup();
          reject(data.error);
        }
      };
      
      this.eventBus.on('request:success', successHandler);
      this.eventBus.on('request:error', errorHandler);
    });
  }
  
  private async processQueue() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      while (true) {
        const request = this.requestQueue.dequeue();
        if (!request) break;
        
        await this.processRequest(request);
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  private async processRequest(request: QueuedRequest) {
    this.eventBus.emit('request:start', { id: request.id });
    
    // Run validation chain
    for (const validator of this.validators) {
      const result = await validator.validate(request);
      
      if (!result.valid) {
        if (result.action === 'defer') {
          // Put back in queue for later
          this.requestQueue.enqueue(request);
          return;
        } else if (result.action === 'wait') {
          // Stop processing, wait for event
          this.requestQueue.enqueue(request);
          this.isProcessing = false;
          return;
        } else if (result.action === 'fail') {
          // Permanent failure
          this.eventBus.emit('request:error', { 
            id: request.id, 
            error: new Error(result.reason) 
          });
          return;
        }
      }
    }
    
    // All validations passed, execute request
    try {
      const data = await request.executor();
      this.eventBus.emit('request:success', { id: request.id, data });
    } catch (error) {
      if (request.retries < request.maxRetries) {
        // Retry with backoff
        request.retries++;
        const delay = Math.pow(2, request.retries) * 1000;
        setTimeout(() => {
          this.requestQueue.enqueue(request);
          this.processQueue();
        }, delay);
      } else {
        // Max retries exceeded
        this.eventBus.emit('request:error', { 
          id: request.id, 
          error: error instanceof Error ? error : new Error('Unknown error')
        });
      }
    }
  }
  
  // Public API
  getEventBus(): EventBus {
    return this.eventBus;
  }
  
  getQueueStatus() {
    return this.requestQueue.getStatus();
  }
}
```

### 4.3 EventBus Implementation

```typescript
type EventHandler<T = any> = (data: T) => void;

export class EventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  
  on<K extends keyof SyncEvents>(
    event: K, 
    handler: (data: SyncEvents[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }
  
  emit<K extends keyof SyncEvents>(
    event: K, 
    data: SyncEvents[K]
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[EventBus] Error in handler for event "${event}":`, error);
      }
    });
  }
  
  off<K extends keyof SyncEvents>(
    event: K, 
    handler: (data: SyncEvents[K]) => void
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  once<K extends keyof SyncEvents>(
    event: K, 
    handler: (data: SyncEvents[K]) => void
  ): void {
    const wrappedHandler = (data: SyncEvents[K]) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }
  
  clear(): void {
    this.listeners.clear();
  }
}
```

### 4.4 RequestQueue Implementation

```typescript
export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private maxConcurrent = 3;
  private processing = 0;
  
  enqueue(request: QueuedRequest): void {
    // Insert by priority (lower number = higher priority)
    const insertIndex = this.queue.findIndex(
      r => r.priority > request.priority
    );
    
    if (insertIndex === -1) {
      this.queue.push(request);
    } else {
      this.queue.splice(insertIndex, 0, request);
    }
  }
  
  dequeue(): QueuedRequest | null {
    if (this.processing >= this.maxConcurrent) {
      return null;
    }
    
    const request = this.queue.shift();
    if (request) {
      this.processing++;
    }
    return request || null;
  }
  
  markComplete(requestId: string): void {
    this.processing = Math.max(0, this.processing - 1);
  }
  
  getStatus() {
    return {
      queued: this.queue.length,
      processing: this.processing,
      total: this.queue.length + this.processing
    };
  }
  
  clear(): void {
    this.queue = [];
    this.processing = 0;
  }
}
```

---

## 5. Migration Plan

### 5.1 Phase 1: Infrastruktur (Week 1)

**Ziel:** Core-Module implementieren ohne Breaking Changes

- [ ] EventBus implementieren + Tests
- [ ] RequestQueue implementieren + Tests
- [ ] Validators implementieren + Tests
- [ ] SyncMiddleware Core-Klasse
- [ ] TypeScript Types & Interfaces
- [ ] Unit-Tests (>90% Coverage)

**Deliverable:** Funktionsfähiges SyncMiddleware-Modul

### 5.2 Phase 2: React-Integration (Week 2)

**Ziel:** React Hooks und Context

- [ ] useSyncRequest Hook
- [ ] useSyncMiddleware Hook
- [ ] SyncMiddlewareProvider Context
- [ ] AuthRequiredModal Component
- [ ] SettingsRequiredModal Component
- [ ] Integration Tests

**Deliverable:** React-fertige API

### 5.3 Phase 3: Migration (Week 3)

**Ziel:** Schrittweise Umstellung existierender Code

**Reihenfolge:**
1. Upload-Funktion in `rabbit.tsx` (High-Value, Low-Risk)
2. Settings-Update Requests
3. GitHub-Export Requests
4. Optional: GET-Requests (wenn sinnvoll)

**Migration-Strategie:**
```typescript
// Before (rabbit.tsx)
const uploadRecording = async (localId, audioBlob, recordingTime) => {
  // ... viel Code für Auth-Check, Settings-Check, etc.
  const response = await fetch('/api/recordings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  // ... Error-Handling
};

// After (rabbit.tsx)
const { execute: uploadRecording } = useSyncRequest('upload', {
  priority: RequestPriority.HIGH,
  requiresSettings: true
});

// Usage bleibt gleich
await uploadRecording({ localId, audioBlob, recordingTime });
```

### 5.4 Phase 4: Monitoring & Optimierung (Week 4)

**Ziel:** Production-Ready

- [ ] Error-Tracking Integration
- [ ] Performance-Monitoring
- [ ] Queue-Status UI-Komponente
- [ ] Dokumentation finalisieren
- [ ] E2E Tests für kritische Flows

---

## 6. Herausforderungen & Lösungen

### 6.1 Vereinheitlichung mit TanStack Query

**Ansatz:** SyncMiddleware als umfassende Wrapper-Schicht um TanStack Query

**Vorteile der Vereinheitlichung:**
- ✅ Konsistente API für alle Backend-Operationen (Queries + Mutations)
- ✅ Validation Chain gilt für **alle** Requests, nicht nur Mutations
- ✅ Einheitliches Error-Handling und Event-System
- ✅ GET-Requests profitieren von Auth/Settings-Validation
- ✅ Entwickler müssen nur eine API lernen (useSyncQuery/useSyncMutation)

**Implementation:**
- SyncMiddleware wraps `useQuery` und `useMutation` von TanStack Query
- Validation-Chain läuft **vor** jeder Query/Mutation-Ausführung
- Alle TanStack Query Features bleiben verfügbar (Caching, Refetching, etc.)
- Event-basierte Invalidierung von Query-Cache bei Mutations

**Beispiel:**
```typescript
// Unified API für alle Operationen
const syncMiddleware = useSyncMiddleware();

// GET mit Auto-Validation
const recordings = useSyncQuery('/api/recordings', {
  requiresAuth: true  // Token-Check vor Request
});

// POST/PATCH/DELETE mit voller Validation-Chain
const upload = useSyncMutation('upload', uploadFn, {
  requiresAuth: true,
  requiresSettings: true,
  onSuccess: () => {
    // Auto-Invalidierung verwandter Queries
    syncMiddleware.invalidateQueries(['/api/recordings']);
  }
});

// Events für Cross-Component-Kommunikation
syncMiddleware.getEventBus().on('request:success', (data) => {
  if (data.type === 'upload') {
    toast.success('Upload completed');
  }
});
```

**Migration-Strategie:**
```typescript
// Before: Direktes TanStack Query
const { data } = useQuery({ queryKey: ['/api/recordings'] });
const mutation = useMutation({ mutationFn: uploadFn });

// After: Unified SyncMiddleware
const { data } = useSyncQuery('/api/recordings', { requiresAuth: true });
const mutation = useSyncMutation('upload', uploadFn, { 
  requiresAuth: true, 
  requiresSettings: true 
});
```

### 6.2 Challenge: Race Conditions

**Problem:** Mehrere Komponenten könnten gleichzeitig Requests absetzen

**Lösung:**
- Request-Deduplizierung über Request-ID
- Idempotenz-Keys für Backend-Requests
- Optimistic Updates in IndexedDB

**Implementierung:**
```typescript
class RequestQueue {
  private pendingRequests = new Map<string, QueuedRequest>();
  
  enqueue(request: QueuedRequest): void {
    const dedupKey = this.getDedupKey(request);
    
    if (this.pendingRequests.has(dedupKey)) {
      console.log('[Queue] Duplicate request detected, skipping');
      return;
    }
    
    this.pendingRequests.set(dedupKey, request);
    this.queue.push(request);
  }
  
  private getDedupKey(request: QueuedRequest): string {
    return `${request.type}:${JSON.stringify(request.payload)}`;
  }
}
```

### 6.3 Challenge: Offline-Queue Persistence

**Problem:** Queue geht verloren bei Page-Reload

**Lösung:**
- Queue in IndexedDB persistieren
- Restore on App-Start
- Garbage-Collection für alte Requests

**Implementierung:**
```typescript
class RequestQueue {
  private readonly STORAGE_KEY = 'sync_middleware_queue';
  
  async persistQueue(): Promise<void> {
    await indexedDB.set(this.STORAGE_KEY, {
      queue: this.queue,
      timestamp: Date.now()
    });
  }
  
  async restoreQueue(): Promise<void> {
    const stored = await indexedDB.get(this.STORAGE_KEY);
    if (stored && stored.queue) {
      // Filter out requests older than 24h
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      this.queue = stored.queue.filter(r => r.timestamp > cutoff);
    }
  }
}
```

### 6.4 Challenge: User Experience bei Auth-Interruption

**Problem:** User wird mitten im Flow unterbrochen

**Lösung:**
- Context-aware Modals mit Request-Info
- "Continue where you left off" nach Login
- Transparent: User sieht welcher Request blockiert

**UX-Flow:**
```
1. User startet Upload
2. Token abgelaufen → AuthRequiredModal öffnet
3. Modal zeigt: "Login required to upload recording"
4. User loggt sich ein
5. Upload wird automatisch fortgesetzt
6. Success-Notification: "Upload completed"
```

### 6.5 Challenge: Testing-Komplexität

**Problem:** Asynchrone, Event-basierte Architektur schwer zu testen

**Lösung:**
- Dependency Injection für alle Abhängigkeiten
- Mock-Implementierungen für Validators
- Helper für Event-Assertions
- Integration-Tests mit echtem IndexedDB

**Test-Utilities:**
```typescript
class TestEventBus extends EventBus {
  async waitForEvent<K extends keyof SyncEvents>(
    event: K, 
    timeout = 5000
  ): Promise<SyncEvents[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);
      
      this.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
}
```

---

## 7. Alternative Ansätze (Discarded)

### 7.1 Alternative A: Globaler Axios-Interceptor

**Idee:** Axios/Fetch-Interceptor für Auth & Settings-Check

**Pro:**
- ✅ Automatisch für alle Requests
- ✅ Wenig Code-Änderungen nötig

**Contra:**
- ❌ Keine Queue-Funktionalität
- ❌ Schwer testbar
- ❌ Keine Event-basierte Kommunikation
- ❌ UI-Modals schwer zu integrieren

**Entscheidung:** ❌ Verworfen - zu inflexibel

### 7.2 Alternative B: Direkte TanStack Query Middleware

**Idee:** Custom Middleware direkt in TanStack Query ohne Wrapper-Schicht

**Pro:**
- ✅ Native Integration mit Query
- ✅ Bereits vertraute API

**Contra:**
- ❌ TanStack Query bietet keine native Middleware-API
- ❌ Keine Queue-Funktionalität für Offline-Persistenz
- ❌ Komplexe Custom-Implementation in Query internals nötig
- ❌ Event-System müsste separat implementiert werden
- ❌ Schwierig, Validation-Chain zu integrieren

**Entscheidung:** ❌ Verworfen - zu limitiert

**Gewählter Ansatz:** 
Stattdessen SyncMiddleware als **umfassende Wrapper-Schicht** um TanStack Query, die:
- ✅ Alle TanStack Query Features beibehält
- ✅ Validation-Chain, Queue und Events hinzufügt
- ✅ Vereinheitlichte API für alle Requests bietet
- ✅ Schrittweise Migration ermöglicht

### 7.3 Alternative C: Redux Saga/Thunk

**Idee:** Redux für State-Management mit Saga für Side-Effects

**Pro:**
- ✅ Etabliertes Pattern
- ✅ Gute DevTools
- ✅ Side-Effect-Handling

**Contra:**
- ❌ Massive Bundle-Size-Erhöhung
- ❌ Breaking Change für existierende Architektur
- ❌ Overhead für einfache Use-Cases
- ❌ Team muss Redux lernen

**Entscheidung:** ❌ Verworfen - zu heavy-weight

### 7.4 Warum SyncMiddleware?

**Gewinner-Eigenschaften:**
- ✅ Leichtgewichtig (< 10KB gzipped)
- ✅ Vollständig vereinheitlicht mit TanStack Query (keine parallelen APIs)
- ✅ Event-basiert (entkoppelt)
- ✅ Queue + Retry + Validation in einem
- ✅ Minimale Breaking Changes (Wrapper-Ansatz)
- ✅ Testbar durch DI
- ✅ Schrittweise Migration möglich
- ✅ Konsistente Entwickler-Experience für alle Backend-Operationen

---

## 8. Performance & Skalierung

### 8.1 Performance-Ziele

| Metrik | Ziel | Messung |
|--------|------|---------|
| Request-Overhead | < 50ms | Enqueue bis Validation |
| Event-Emission | < 5ms | Emit bis Handler-Ausführung |
| Queue-Verarbeitung | < 100ms | Dequeue bis Request-Start |
| Memory-Footprint | < 5MB | Heap-Size mit 100 Requests |
| Bundle-Size | < 10KB | Gzipped SyncMiddleware |

### 8.2 Optimierungen

**1. Event-Debouncing:**
```typescript
class EventBus {
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  
  emitDebounced<K extends keyof SyncEvents>(
    event: K, 
    data: SyncEvents[K],
    delay = 300
  ): void {
    const existing = this.debounceTimers.get(event);
    if (existing) clearTimeout(existing);
    
    this.debounceTimers.set(event, setTimeout(() => {
      this.emit(event, data);
      this.debounceTimers.delete(event);
    }, delay));
  }
}
```

**2. Request-Batching:**
```typescript
class RequestQueue {
  async enqueueBatch(requests: QueuedRequest[]): Promise<void> {
    // Sort by priority
    requests.sort((a, b) => a.priority - b.priority);
    
    // Insert in bulk
    this.queue.push(...requests);
    
    // Single persistence call
    await this.persistQueue();
  }
}
```

**3. Validator-Caching:**
```typescript
class AuthValidator implements Validator {
  private cache: { valid: boolean; timestamp: number } | null = null;
  private CACHE_TTL = 5000; // 5s
  
  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const now = Date.now();
    if (this.cache && now - this.cache.timestamp < this.CACHE_TTL) {
      return { valid: this.cache.valid };
    }
    
    // Actual validation
    const result = await this.doValidation(request);
    this.cache = { valid: result.valid, timestamp: now };
    return result;
  }
}
```

### 8.3 Monitoring

**Metriken:**
```typescript
interface SyncMiddlewareMetrics {
  requests: {
    total: number;
    success: number;
    failed: number;
    pending: number;
  };
  queue: {
    size: number;
    processingTime: number; // avg ms
  };
  validators: {
    authFailures: number;
    settingsFailures: number;
    offlineDefers: number;
  };
}
```

**Reporting:**
```typescript
class SyncMiddleware {
  getMetrics(): SyncMiddlewareMetrics {
    return this.metrics;
  }
  
  // Optional: Send to analytics
  private reportMetrics() {
    if (window.gtag) {
      window.gtag('event', 'sync_middleware_metrics', this.metrics);
    }
  }
}
```

---

## 9. Testing-Strategie

### 9.1 Unit-Tests (Target: >90% Coverage)

**EventBus:**
- [ ] Event emission & listening
- [ ] Unsubscribe functionality
- [ ] Error-Handling in listeners
- [ ] Once-functionality
- [ ] Memory-Leaks (listener cleanup)

**RequestQueue:**
- [ ] Enqueue/Dequeue priority
- [ ] Concurrent processing limit
- [ ] Persistence & Restore
- [ ] Deduplication

**Validators:**
- [ ] OnlineValidator: navigator.onLine states
- [ ] RecordingValidator: recording state transitions
- [ ] AuthValidator: token expiry, missing token
- [ ] SettingsValidator: missing keys, valid config

**SyncMiddleware:**
- [ ] Request lifecycle (enqueue → validate → execute)
- [ ] Error-Handling & Retry-Logic
- [ ] Event-Emission at correct times
- [ ] Queue resume after auth/settings

### 9.2 Integration-Tests

**Scenarios:**
- [ ] Happy Path: Request succeeds first try
- [ ] Auth-Interrupt: Token expired mid-queue
- [ ] Settings-Interrupt: Missing API key
- [ ] Offline-Recovery: Request deferred, resumes when online
- [ ] Retry-Logic: Transient error, succeeds on retry
- [ ] Max-Retries: Permanent failure after 3 attempts

**Example:**
```typescript
describe('SyncMiddleware - Integration', () => {
  it('should handle auth interrupt and resume', async () => {
    // Setup
    const middleware = new SyncMiddleware(mockGetSettings, mockIsRecording);
    clearStoredToken(); // Simulate expired token
    
    // Enqueue request
    const promise = middleware.enqueueRequest({
      type: 'upload',
      priority: RequestPriority.HIGH,
      payload: { data: 'test' },
      executor: mockExecutor
    });
    
    // Wait for auth:required event
    const authEvent = await middleware.getEventBus().waitForEvent('auth:required');
    expect(authEvent.requestId).toBeDefined();
    
    // Simulate successful login
    setStoredToken('new-token');
    middleware.getEventBus().emit('auth:success', { userId: 'test-user' });
    
    // Request should complete
    const result = await promise;
    expect(result).toBeDefined();
    expect(mockExecutor).toHaveBeenCalled();
  });
});
```

### 9.3 E2E-Tests (Playwright)

**Critical Flows:**
- [ ] Upload with expired token → Login → Upload completes
- [ ] Upload without Mistral key → Settings → Upload completes
- [ ] Offline upload → Queue persists → Online → Upload completes
- [ ] Multiple uploads queued → Process in priority order

---

## 10. Dokumentation & Onboarding

### 10.1 Developer-Dokumentation

**Inhalte:**
- Architecture Overview (dieses Dokument)
- API-Reference (JSDoc + Generated Docs)
- Migration-Guide (Before/After Examples)
- Testing-Guide
- Troubleshooting

**Tools:**
- TypeDoc für API-Docs
- Storybook für UI-Komponenten
- Code-Beispiele im Repo

### 10.2 ADR (Architecture Decision Records)

**Wichtige Entscheidungen dokumentieren:**
- ADR-001: Warum Event-basiert statt Callback-basiert?
- ADR-002: Warum eigene Queue statt Bull/Bee?
- ADR-003: Warum vollständig vereinheitlichter Ansatz mit TanStack Query (Wrapper statt Hybrid)?
- ADR-004: Validation-Chain-Reihenfolge
- ADR-005: Warum alle Requests über SyncMiddleware statt nur Mutations?

### 10.3 Code-Kommentare

**JSDoc für alle Public APIs:**
```typescript
/**
 * Enqueues a request for processing by the SyncMiddleware.
 * 
 * The request will go through the validation chain:
 * 1. Online check
 * 2. Recording check
 * 3. Auth check
 * 4. Settings check (if requiresSettings=true)
 * 
 * @template T - Type of the response data
 * @param options - Request configuration
 * @returns Promise that resolves with the response data
 * @throws {Error} If max retries exceeded or permanent failure
 * 
 * @example
 * ```typescript
 * const data = await syncMiddleware.enqueueRequest({
 *   type: 'upload',
 *   priority: RequestPriority.HIGH,
 *   payload: { audioBlob, recordingId },
 *   requiresSettings: true
 * });
 * ```
 */
async enqueueRequest<T>(options: EnqueueOptions): Promise<T>
```

---

## 11. Zeitplan & Ressourcen

### 11.1 Geschätzte Aufwände

| Phase | Tasks | Stunden | Woche |
|-------|-------|---------|-------|
| **Phase 1: Infrastruktur** | | | |
| EventBus | Implementation + Tests | 8h | 1 |
| RequestQueue | Implementation + Tests | 12h | 1 |
| Validators | 4x Validators + Tests | 16h | 1 |
| SyncMiddleware | Core + Tests | 16h | 1 |
| **Phase 2: React** | | | |
| Hooks | useSyncQuery + useSyncMutation + Context | 12h | 2 |
| UI-Components | Modals | 8h | 2 |
| Integration Tests | E2E-Setup | 8h | 2 |
| **Phase 3: Migration** | | | |
| Query-Migration | Alle useQuery zu useSyncQuery | 12h | 3 |
| Mutation-Migration | Alle useMutation zu useSyncMutation | 12h | 3 |
| Cleanup | Alte queryClient.ts Code-Removal | 4h | 3 |
| **Phase 4: Polish** | | | |
| Monitoring | Metrics + Dashboard | 8h | 4 |
| Dokumentation | Guides + Docs | 8h | 4 |
| **Total** | | **132h** | **4 Wochen** |

### 11.2 Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Breaking Changes in TanStack Query | Niedrig | Hoch | Wrapper-Layer |
| Performance-Probleme bei vielen Requests | Mittel | Mittel | Batching + Throttling |
| Komplexe Edge-Cases | Hoch | Mittel | Umfangreiche Tests |
| Team-Adoption | Mittel | Mittel | Gute Docs + Pair-Programming |

---

## 12. Fazit & Empfehlung

### 12.1 Zusammenfassung

**SyncMiddleware löst folgende Probleme:**
✅ Zentralisierte Backend-Kommunikation  
✅ Automatische Auth & Settings-Validierung für **alle** Requests  
✅ Event-basierte Architektur  
✅ Request-Queueing mit Retry-Logic  
✅ Minimale Breaking Changes (Wrapper-Ansatz)  
✅ Vereinheitlichte API für Queries und Mutations

**Vorteile:**
- Reduziert Code-Duplikation um ~40%
- Verbessert Testbarkeit
- Konsistente Entwickler-Experience (eine API statt zwei)
- Validation-Chain gilt für alle Backend-Operationen
- Klare Separation of Concerns
- Skalierbar für zukünftige Features (WebSocket-Integration, etc.)

**Nachteile:**
- Initiale Entwicklungszeit: ~132h
- Team muss neue Abstraction lernen
- Alle GET-Requests müssen migriert werden (nicht nur Mutations)

### 12.2 Empfehlung

**✅ EMPFOHLEN** - SyncMiddleware mit vollständiger TanStack Query Integration sollte implementiert werden.

**Begründung:**
1. **Code-Quality:** Massiv verbesserte Architektur durch Vereinheitlichung
2. **Maintainability:** Einfacher zu erweitern und zu testen
3. **Developer-Experience:** Eine konsistente API statt paralleler Systeme
4. **User-Experience:** Konsistente Auth/Settings-Flows für alle Operationen
5. **Zukunftssicherheit:** Foundation für weitere Features

**Vorschlag:**
- Start mit Phase 1 (Infrastruktur) als Proof-of-Concept
- Nach 2 Wochen: Review mit Team
- Bei positivem Feedback: Phase 2-4 durchführen

### 12.3 Nächste Schritte

1. **Review:** Team-Meeting zu diesem Plan (1h)
2. **Approval:** Stakeholder-Approval einholen
3. **Kickoff:** Phase 1 starten mit einem Developer
4. **Checkpoints:** Weekly Reviews während Implementation

---

## 13. Appendix

### 13.1 Referenzen

- [TanStack Query Docs](https://tanstack.com/query)
- [Event-Driven Architecture Pattern](https://martinfowler.com/articles/201701-event-driven.html)
- [Queue Pattern](https://www.patterns.dev/posts/queue-pattern)
- [OAuth2 Best Practices](https://oauth.net/2/)

### 13.2 Glossar

| Begriff | Definition |
|---------|------------|
| **EventBus** | Zentrale Event-Verwaltung für lose-gekoppelte Komponenten |
| **RequestQueue** | FIFO-Queue mit Priorität für Backend-Requests |
| **Validator** | Prüf-Komponente in der Validation-Chain |
| **Validation-Chain** | Sequenzielle Ausführung von Validatoren |
| **BYOK** | Bring Your Own Key - User bringt eigenen API Key mit |
| **Deferred Request** | Request wird zurückgestellt, aber nicht verworfen |

### 13.3 Änderungshistorie

| Version | Datum | Änderungen | Autor |
|---------|-------|------------|-------|
| 1.0 | 2025-11-18 | Initial Draft | AI Planning |

---

## Kontakt & Feedback

Für Fragen oder Feedback zu diesem Plan:
- GitHub Issue: [Link zum Issue]
- Team-Chat: #rabbitmistralscribe

---

**Ende der Planung**
