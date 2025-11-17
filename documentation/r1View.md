# Rabbit R1 View Implementation

## Übersicht

Die Rabbit R1 View (`/rabbit`) ist eine stark vereinfachte, offline-fähige Benutzeroberfläche, die speziell für das Rabbit R1 Gerät (240x282px Display) optimiert wurde. Sie bietet eine minimalistische Bedienung mit Fokus auf Robustheit und Offline-Funktionalität.

## Implementierte Features

### 1. Benutzeroberfläche

#### LED Display
- **Hauptelement**: Zentrales LED-Display (16x16 Pixel, 224x224px auf Bildschirm)
- **Idle State**: Zeigt Mistral-Logo (`mistral.png`)
- **Recording State**: 
  - Zeigt Audio-Spektrum-Visualisierung während der Aufnahme
  - Alternative: Mikrofon-Icon als Fallback
- **Interaktiv**: Klickbar zum Starten/Stoppen von Aufnahmen
  - Einfacher Klick: Startet Aufnahme (wenn nicht aktiv)
  - Doppelklick: Stoppt Aufnahme (wenn aktiv)

#### Status Bar
- **Position**: Unterhalb des LED-Displays, fixiert am unteren Rand
- **Höhe**: 6px (24px Schriftgröße 10px)
- **Inhalt**:
  - Links: Timer während Aufnahme / Online-Status wenn idle
  - Rechts: Transkriptions-Status, Batterie-Level
- **Icons**:
  - WiFi (online) / WiFi-Off (offline)
  - Battery / Battery-Charging (mit Prozentanzeige)
  - Loader (uploading/transcribing) / Check (complete) / X (failed)

### 2. Aufnahme-Funktionalität

#### Recording Control
- **Start/Stop Trigger**:
  - Rabbit R1 Hardware: `sideClick` Event
  - Browser Fallback: Klick auf LED-Display
- **Maximale Aufnahmedauer**: 13:37 (817 Sekunden)
  - Automatischer Stop bei Erreichen des Limits
  - Timer-Anzeige in Status Bar (MM:SS Format)
- **Audio Feedback**:
  - Drei-Ton-Melodie bei Start (C5 → E5 → G5)
  - Drei-Ton-Melodie bei Stop
  - Implementiert mit Web Audio API
- **Vibration Feedback**: 50ms Vibration (falls unterstützt)

#### Audio Processing
- **MediaRecorder API**:
  - Format: `audio/webm;codecs=opus`
  - Chunk-Size: 100ms (für Echtzeit-Visualisierung)
  - Echo-Cancellation, Noise-Suppression, Auto-Gain-Control aktiviert
- **Speicherung**: Sofortige Speicherung in IndexedDB als Blob

### 3. Offline-First Architektur

#### Lokale Speicherung (IndexedDB)
```typescript
interface LocalRecording {
  id: string;                    // UUID
  audioBlob: Blob;              // Audio-Daten
  duration: number;             // Aufnahme-Dauer in Sekunden
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  createdAt: Date;
  serverRecordingId?: string;   // Nach Upload gesetzt
  title?: string;               // Nach Transkription
  transcript?: string;          // Nach Transkription
  summary?: string;             // Nach Transkription
}
```

#### Synchronisations-Strategie
1. **Aufnahme**: Speichern in IndexedDB mit Status `queued`
2. **Online & Authenticated**: Sofortiger Upload-Versuch
3. **Offline / Not Authenticated**: Verbleibt in lokaler Queue
4. **Network Reconnect**: Automatische Synchronisation aller `queued`/`failed` Aufnahmen
5. **Nach Transkription**: Lokale Kopie wird gelöscht (spart Speicherplatz)

#### Authentifizierung
- **Kein Login erzwungen**: View ist ohne Authentifizierung nutzbar
- **Login-Check**: Passiv im Hintergrund, wenn online
- **Upload**: Nur bei vorhandener Authentifizierung
- **Fallback**: Aufnahmen bleiben lokal gespeichert bis zur Anmeldung

### 4. Batterie-Status (Battery Status API)

```typescript
interface BatteryStatus {
  level: number;      // 0.0 - 1.0 (0% - 100%)
  charging: boolean;  // Ladezustand
  supported: boolean; // API verfügbar?
}
```

- **Hook**: `useBatteryStatus()`
- **Updates**: Event-basiert (levelchange, chargingchange)
- **Anzeige**: Prozent-Anzeige mit Icon (Battery/BatteryCharging)
- **Fallback**: Versteckt wenn nicht unterstützt

### 5. Transkriptions-Monitoring

- **Status-Tracking**:
  - `idle`: Keine aktive Verarbeitung
  - `uploading`: Upload zum Server läuft
  - `transcribing`: Transkription durch Mistral API
  - `complete`: Erfolgreich abgeschlossen
  - `failed`: Fehler aufgetreten
- **Polling**: Alle 15 Sekunden Status-Check bei laufenden Transkriptionen
- **Max Attempts**: 20 Versuche (~5 Minuten)
- **Cleanup**: Nach erfolgreicher Transkription wird lokale Aufnahme gelöscht

## Technische Implementierung

### Neue Komponenten

#### 1. `/client/src/pages/rabbit.tsx`
Haupt-Komponente der Rabbit R1 View:
- Zustandsverwaltung für Aufnahme, Status, Bitmaps
- Event-Handling (sideClick, LED-Klick, Network)
- Recording-Logik mit Auto-Stop
- Synchronisations-Logik

#### 2. `/client/src/components/RabbitStatusBar.tsx`
Minimalistische Status-Bar:
- 10px Schriftgröße für kompakte Darstellung
- Icon-basierte Status-Anzeige
- Conditional Rendering (Timer vs. Status)

#### 3. `/client/src/hooks/useBatteryStatus.ts`
Hook für Battery Status API:
- Event-Listener für Batterie-Updates
- Type-Safe Interface
- Graceful Fallback bei fehlender API-Unterstützung

#### 4. `/client/src/utils/audioFeedback.ts`
Audio-Feedback mit Web Audio API:
- Drei-Ton-Melodie (C-Dur Akkord)
- Optimierte Envelope (Attack, Sustain, Release)
- Silent Fail bei Audio-Fehlern

### Routing

```typescript
// App.tsx
<Route path="/rabbit" component={RabbitR1} />
```

- **Keine Authentifizierung erforderlich**
- **Keine Umleitung** zu /auth
- **Direkter Zugriff** möglich

### Bestehende Komponenten (Wiederverwendet)

- `LEDPixelDisplay`: LED-Matrix-Darstellung
- `useOnlineStatus`: Network-Status-Hook
- `indexedDB`: Lokale Datenspeicherung
- `ImageBitmapProvider`: Laden von Bitmap-Grafiken
- `queryClient`: TanStack Query für Server-State

## Funktionalität & Status

### ✅ Vollständig Implementiert

1. **Offline-Fähigkeit**
   - Aufnahmen ohne Internet möglich
   - Lokale Speicherung in IndexedDB
   - Automatische Synchronisation bei Verbindung

2. **LED Display**
   - Mistral-Logo im Idle-State
   - Audio-Visualisierung während Aufnahme
   - Klickbare Interaktion

3. **Aufnahme-Funktionalität**
   - sideClick Event-Unterstützung
   - 13:37 Maximal-Dauer mit Auto-Stop
   - Drei-Ton-Melodie Feedback
   - Vibrations-Feedback

4. **Status-Anzeige**
   - Online/Offline Status
   - Batterie-Level mit Ladezustand
   - Transkriptions-Status (Icons)
   - Recording-Timer

5. **Synchronisation**
   - Hintergrund-Upload bei Verbindung
   - Retry-Mechanismus für fehlgeschlagene Uploads
   - Cleanup nach erfolgreicher Transkription

### ⚠️ Einschränkungen

1. **Authentifizierung**
   - Passiver Check, keine aktive Login-Aufforderung
   - Upload nur bei bestehender Session möglich
   - Keine Fehler-UI wenn nicht authentifiziert

2. **Fehlerbehandlung**
   - Minimales Error-Feedback für User
   - Fehler werden nur via Console-Log kommuniziert
   - Keine expliziten Error-Toasts oder Modals

3. **Transkriptions-Feedback**
   - Nur Status-Icons, keine detaillierten Nachrichten
   - Kein Fortschrittsbalken während Transkription
   - Keine Anzeige der Transkriptions-Ergebnisse in der View

## Verbesserungspotenzial & Robustheit

### 1. Fehlerbehandlung

**Aktueller Stand:**
- Silent Fails bei Audio-Feedback
- Console-Logging für Fehler
- Minimales User-Feedback

**Empfohlene Verbesserungen:**
```typescript
// Error-Boundary für Komponente
<ErrorBoundary fallback={<MinimalErrorUI />}>
  <RabbitR1 />
</ErrorBoundary>

// Fehler-Toast für kritische Fehler
if (uploadFailed && retryCount > 3) {
  showMinimalToast('Upload fehlgeschlagen');
}

// Retry-Strategie mit exponential backoff
async function uploadWithRetry(recording, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await upload(recording);
      return;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await delay(Math.pow(2, i) * 1000);
    }
  }
}
```

### 2. Redundanz-Vermeidung

**Identifizierte Redundanzen:**

1. **Recording-Logik**: Ähnliche Implementierung in `home.tsx`
   ```typescript
   // Empfehlung: Auslagern in Hook
   function useRecording(options?: RecordingOptions) {
     // Gemeinsame Aufnahme-Logik
   }
   ```

2. **Synchronisations-Logik**: Dupliziert zwischen Views
   ```typescript
   // Empfehlung: Zentraler Service
   class RecordingSyncService {
     async syncPendingRecordings() { }
     async uploadRecording() { }
     startMonitoring() { }
   }
   ```

3. **Status-Management**: Mehrfache Implementierung
   ```typescript
   // Empfehlung: Zustand in Context
   const RecordingContext = createContext<RecordingState>();
   ```

### 3. Performance-Optimierung

**Aktuelle Bottlenecks:**
- Polling alle 15s während Transkription
- Kein Caching von Bitmap-Grafiken
- Re-Render bei jedem Timer-Tick

**Verbesserungsvorschläge:**
```typescript
// 1. WebSocket statt Polling
const ws = useWebSocket('/api/recordings/status');

// 2. Bitmap-Caching
const mistralBitmap = useMemo(() => 
  loadBitmap('/mistral.png'), []
);

// 3. Timer in Web Worker
const timerWorker = useMemo(() => 
  new Worker('./timer-worker.js'), []
);
```

### 4. Offline-Persistenz

**Risiken:**
- IndexedDB kann vom Browser gelöscht werden
- Keine Backup-Strategie
- Speicherplatz-Limits nicht geprüft

**Verbesserungen:**
```typescript
// Storage-Management
async function checkStorageQuota() {
  const estimate = await navigator.storage.estimate();
  const percentUsed = (estimate.usage / estimate.quota) * 100;
  
  if (percentUsed > 80) {
    // Alte Aufnahmen bereinigen
    await cleanupOldRecordings();
  }
}

// Persistent Storage Request
if (navigator.storage?.persist) {
  await navigator.storage.persist();
}
```

### 5. Sicherheit

**Sicherheitsaspekte:**
- Keine Authentifizierung = Jeder kann aufnehmen
- Audio-Daten nur client-seitig verschlüsselt im IndexedDB
- Kein CSRF-Token bei Uploads

**Empfehlungen:**
```typescript
// Optional: Device-Token für anonyme Sessions
const deviceToken = localStorage.getItem('deviceToken') || 
  generateDeviceToken();

// Verschlüsselung sensitiver Daten
import { encrypt, decrypt } from './crypto';
const encryptedBlob = await encrypt(audioBlob);
```

## Test-Abdeckung

### Aktuelle Test-Situation

**Bestehende Tests (aus Haupt-App):**
- ✅ IndexedDB Manager Tests
- ✅ LED Display Tests
- ✅ Online-Status Hook Tests
- ✅ Audio-Feedback (keine expliziten Tests)
- ✅ Battery Status (keine expliziten Tests)

**Fehlende Tests für R1-View:**
- ❌ RabbitR1 Component Tests
- ❌ RabbitStatusBar Component Tests
- ❌ Integration Tests (Recording → Upload → Transcription)
- ❌ E2E Tests für Offline-Szenarien

### Empfohlene Test-Strategie

#### 1. Unit Tests

```typescript
// useBatteryStatus.test.ts
describe('useBatteryStatus', () => {
  it('should return default values when API not supported', () => {
    const { result } = renderHook(() => useBatteryStatus());
    expect(result.current.supported).toBe(false);
  });

  it('should update battery level on change events', async () => {
    // Mock Battery API
    const mockBattery = createMockBattery({ level: 0.8 });
    global.navigator.getBattery = () => Promise.resolve(mockBattery);
    
    const { result } = renderHook(() => useBatteryStatus());
    await waitFor(() => expect(result.current.level).toBe(0.8));
  });
});

// audioFeedback.test.ts
describe('audioFeedback', () => {
  it('should not throw when playing melody', async () => {
    await expect(playThreeToneMelody()).resolves.not.toThrow();
  });

  it('should handle missing AudioContext gracefully', async () => {
    global.AudioContext = undefined;
    await expect(playRecordingStartSound()).resolves.not.toThrow();
  });
});
```

#### 2. Component Tests

```typescript
// RabbitStatusBar.test.tsx
describe('RabbitStatusBar', () => {
  it('should display recording timer when recording', () => {
    render(<RabbitStatusBar isRecording={true} recordingTime={65} />);
    expect(screen.getByTestId('recording-timer')).toHaveTextContent('01:05');
  });

  it('should show online icon when connected', () => {
    render(<RabbitStatusBar isOnline={true} isRecording={false} />);
    expect(screen.getByTestId('online-icon')).toBeInTheDocument();
  });

  it('should display battery percentage when supported', () => {
    mockBatteryAPI({ level: 0.75, supported: true });
    render(<RabbitStatusBar />);
    expect(screen.getByTestId('battery-level')).toHaveTextContent('75%');
  });
});

// rabbit.test.tsx
describe('RabbitR1', () => {
  it('should start recording on LED click', async () => {
    render(<RabbitR1 />);
    const ledDisplay = screen.getByTestId('led-display');
    
    await userEvent.click(ledDisplay);
    
    expect(screen.getByTestId('recording-timer')).toBeInTheDocument();
  });

  it('should auto-stop recording at 13:37', async () => {
    jest.useFakeTimers();
    render(<RabbitR1 />);
    
    // Start recording
    await userEvent.click(screen.getByTestId('led-display'));
    
    // Fast-forward to 817 seconds
    act(() => {
      jest.advanceTimersByTime(817000);
    });
    
    // Should have stopped
    expect(screen.queryByTestId('recording-timer')).not.toBeInTheDocument();
    
    jest.useRealTimers();
  });
});
```

#### 3. Integration Tests

```typescript
// rabbit.integration.test.tsx
describe('Recording Flow', () => {
  it('should record, save locally, and sync when online', async () => {
    // Setup
    mockIndexedDB();
    mockOnlineStatus(false);
    
    const { rerender } = render(<RabbitR1 />);
    
    // Start recording (offline)
    await userEvent.click(screen.getByTestId('led-display'));
    await waitFor(() => expect(indexedDB.addRecording).toHaveBeenCalled());
    
    // Stop recording
    await userEvent.dblClick(screen.getByTestId('led-display'));
    
    // Verify local storage
    expect(await indexedDB.getAllRecordings()).toHaveLength(1);
    
    // Come online
    mockOnlineStatus(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    
    // Should trigger sync
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/recordings'));
  });
});
```

### Test-Datenschnittstellen

**Kritische Schnittstellen, die getestet werden müssen:**

1. **IndexedDB Interface**
   ```typescript
   interface LocalRecording {
     id: string;
     audioBlob: Blob;
     duration: number;
     status: 'queued' | 'uploading' | 'uploaded' | 'failed';
     // ...
   }
   
   // Tests für: add, update, delete, getAll
   ```

2. **Battery API Interface**
   ```typescript
   interface BatteryManager {
     level: number;
     charging: boolean;
     onlevelchange: EventHandler;
     onchargingchange: EventHandler;
   }
   
   // Tests für: Event-Handler, Updates, Fallbacks
   ```

3. **Recording API Interface**
   ```typescript
   // POST /api/recordings
   interface RecordingUpload {
     audio: Blob;
     duration: string;
   }
   
   // Response
   interface Recording {
     id: string;
     status: 'pending' | 'transcribing' | 'transcribed' | 'failed';
     // ...
   }
   
   // Tests für: Upload, Fehlerbehandlung, Retry-Logik
   ```

## Zusammenfassung

### Ist die Komponente funktionsbereit?

**JA, mit Einschränkungen:**

✅ **Kernanforderungen erfüllt:**
- Offline-Aufnahme funktioniert
- Automatische Synchronisation
- 13:37 Maximal-Dauer
- Minimalistische UI
- Kein Auth-Zwang

⚠️ **Einschränkungen in Produktion:**
- Minimales Error-Feedback
- Keine explizite Login-Aufforderung
- Fehlende Tests für R1-spezifische Features
- Keine Anzeige von Transkriptions-Ergebnissen

### Noch durchzuführende Arbeiten

**Priorität 1 (Kritisch):**
1. Comprehensive Test-Suite für neue Komponenten
2. Error-Handling mit User-Feedback
3. Storage-Quota-Management

**Priorität 2 (Wichtig):**
4. Redundanz-Elimination (Recording-Hook, Sync-Service)
5. WebSocket statt Polling für Transkriptions-Status
6. Performance-Optimierung (Bitmap-Caching, Worker)

**Priorität 3 (Nice-to-have):**
7. Persistent Storage Request
8. Device-Token für anonyme Sessions
9. E2E-Tests mit Playwright
10. Transkriptions-Ergebnis-Anzeige (minimal)

### Wie könnte man die Komponente robuster machen?

1. **Fehlertoleranz erhöhen:**
   - Retry-Logik mit exponential backoff
   - Fallback-UI bei kritischen Fehlern
   - Graceful Degradation (z.B. ohne Battery API)

2. **Redundanzen vermeiden:**
   - Zentrale Recording-Logik in Hook auslagern
   - Sync-Service als Singleton
   - Shared Context für Recording-State

3. **Testabdeckung verbessern:**
   - Unit-Tests für alle neuen Komponenten
   - Integration-Tests für Recording-Flow
   - E2E-Tests für Offline-Szenarien
   - Mock-Strategien für Browser-APIs

4. **Performance optimieren:**
   - WebSocket statt Polling
   - Web Worker für Timer
   - Bitmap-Caching
   - Service Worker für vollständige Offline-Fähigkeit

5. **Sicherheit erhöhen:**
   - Device-Token für anonyme Sessions
   - Client-seitige Verschlüsselung (optional)
   - Storage-Quota-Monitoring
   - Persistent Storage Request

## Fazit

Die Rabbit R1 View ist **funktionsbereit für den Basis-Use-Case** (Aufnahme, lokale Speicherung, automatische Synchronisation). Für den Produktiv-Einsatz sollten jedoch die **Test-Abdeckung** und das **Error-Handling** deutlich verbessert werden. Die identifizierten **Redundanzen** können schrittweise eliminiert werden, ohne die Funktionalität zu beeinträchtigen.

Die Komponente erfüllt die Anforderungen an **Offline-Fähigkeit** und **minimalistische UI** vollständig. Die **Robustheit** kann durch die vorgeschlagenen Verbesserungen deutlich erhöht werden.
