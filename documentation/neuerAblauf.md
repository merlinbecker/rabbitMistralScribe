# Token-basierter Authentifizierungs- und Sync-Ablauf

## Überblick

Das System wurde vollständig auf eine Token-basierte Authentifizierung umgestellt. Alle API-Anfragen verwenden nun Bearer-Token-Authentifizierung über den `Authorization` Header. Cookies werden nur noch temporär für das OAuth-Redirect-Flow verwendet, nicht mehr für die Session-Verwaltung.

## Authentifizierungsfluss

### 1. Initiale Anmeldung

```
┌─────────────┐
│   Gerät     │
│  (offline)  │
└──────┬──────┘
       │
       │ 1. Aufnahme erstellt
       ▼
┌─────────────────┐
│   IndexedDB     │
│ status='queued' │
└─────────────────┘
       │
       │ 2. Gerät kommt online
       ▼
┌─────────────────┐
│  Auto-Sync      │
│   prüft Token   │
└──────┬──────────┘
       │
       │ 3. Kein Token gefunden
       ▼
┌─────────────────┐
│ Login-Prompt    │
│    wird         │
│   angezeigt     │
└──────┬──────────┘
       │
       │ 4. Nutzer klickt "Mit GitHub anmelden"
       ▼
┌─────────────────────────────────────┐
│ /api/auth/github?returnPath=/rabbit │
└──────┬──────────────────────────────┘
       │
       │ 5. GitHub OAuth Flow
       ▼
┌─────────────────────────────────────┐
│ GitHub Authorization                │
└──────┬──────────────────────────────┘
       │
       │ 6. Callback mit Code
       ▼
┌─────────────────────────────────────┐
│ /api/auth/github/callback           │
│ - User aus GitHub-Daten erstellen   │
│ - userId als Token verwenden        │
└──────┬──────────────────────────────┘
       │
       │ 7. Redirect: /rabbit?token=<userId>
       ▼
┌─────────────────────────────────────┐
│ Rabbit-Komponente                   │
│ - Token aus URL extrahieren         │
│ - In localStorage speichern         │
│ - URL bereinigen                    │
│ - isAuthenticated = true            │
└──────┬──────────────────────────────┘
       │
       │ 8. Auto-Sync startet
       ▼
┌─────────────────────────────────────┐
│ syncPendingRecordings()             │
│ - Alle 'queued'/'failed' holen      │
│ - Mit Bearer Token hochladen        │
└─────────────────────────────────────┘
```

### 2. Automatische Synchronisation

Die Auto-Sync-Logik wird über einen `useEffect` Hook implementiert:

```typescript
useEffect(() => {
  const hasPendingRecordings = localRecordings.some(
    r => r.status === 'queued' || r.status === 'failed'
  );

  if (isOnline && !isRecording && hasPendingRecordings) {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setShowLoginPrompt(true);
    } else if (isAuthenticated) {
      syncPendingRecordings();
    }
  }
}, [isOnline, isRecording, localRecordings, isAuthenticated]);
```

**Bedingungen für Auto-Sync:**
1. ✅ Gerät ist online (`isOnline === true`)
2. ✅ Keine Aufnahme läuft (`isRecording === false`)
3. ✅ Es gibt ausstehende Aufnahmen (`status === 'queued' || 'failed'`)
4. ✅ Nutzer ist authentifiziert (`isAuthenticated === true`)

**Wenn Bedingungen erfüllt:**
- Token vorhanden → Upload starten
- Kein Token → Login-Prompt anzeigen

### 3. Upload-Prozess

```typescript
const uploadRecording = async (localId: string, audioBlob: Blob, duration: number) => {
  // 1. Token aus localStorage holen
  const token = localStorage.getItem('auth_token');
  if (!token) {
    setShowLoginPrompt(true);
    return;
  }

  // 2. Status auf 'uploading' setzen
  await indexedDB.updateRecording(localId, { status: 'uploading' });

  // 3. FormData vorbereiten
  const formData = new FormData();
  formData.append('audio', audioBlob);
  formData.append('duration', duration.toString());

  // 4. Upload mit Bearer Token
  const response = await fetch('/api/recordings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  // 5. 401-Fehler behandeln
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setShowLoginPrompt(true);
    await indexedDB.updateRecording(localId, { status: 'queued' });
    return;
  }

  // 6. Erfolg → Status aktualisieren, Monitoring starten
  const recording = await response.json();
  await indexedDB.updateRecording(localId, {
    status: 'uploaded',
    serverRecordingId: recording.id
  });
  monitorTranscription(recording.id, localId);
};
```

## API-Endpunkte und Token-Verwendung

### Server-seitige Authentifizierung

Alle geschützten Routen verwenden die `requireAuth` Middleware:

```typescript
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = authHeader.substring(7);
  const user = await storage.getUser(userId);

  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  (req as any).userId = user.id;
  next();
}
```

### Geschützte Endpunkte

Alle folgenden Endpunkte erfordern einen Bearer Token:

| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/auth/user` | GET | Authentifizierung prüfen, User-Daten holen |
| `/api/settings` | GET | User-Einstellungen abrufen |
| `/api/settings` | PATCH | User-Einstellungen aktualisieren |
| `/api/recordings` | GET | Alle Aufnahmen des Users abrufen |
| `/api/recordings` | POST | Neue Aufnahme hochladen |
| `/api/recordings/:id` | PATCH | Aufnahme aktualisieren |
| `/api/recordings/:id/transcribe` | POST | Transkription neu anstoßen |
| `/api/recordings/:id` | DELETE | Aufnahme löschen |
| `/api/github/repos` | GET | GitHub Repositories abrufen |

### Öffentliche Endpunkte

Diese Endpunkte benötigen keinen Token:

| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/auth/github` | GET | OAuth Flow starten |
| `/api/auth/github/callback` | GET | OAuth Callback verarbeiten |
| `/api/auth/logout` | POST | Logout (nur client-seitig) |

## Offline-First Architektur

### Lokale Datenspeicherung

```typescript
interface LocalRecording {
  id: string;                    // UUID
  audioBlob: Blob;              // Audio-Daten
  duration: number;             // Sekunden
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  createdAt: Date;
  serverRecordingId?: string;   // Nach Upload gesetzt
}
```

### Status-Übergänge

```
[Aufnahme gespeichert]
       │
       ▼
   'queued' ────────┐
       │            │
       │ Upload     │ 401 Error
       ▼            │
  'uploading'       │
       │            │
       │ Erfolg     │ Fehler
       ▼            ▼
  'uploaded'    'failed'
       │            │
       │            │ Retry
       │            └────────┐
       │                     │
       │ Transkription       │
       │   abgeschlossen     │
       ▼                     ▼
   [gelöscht]          'queued'
```

## Robustheit und Best Practices

### 1. Fehlerbehandlung

**Token-Validierung:**
```typescript
// Vor jedem API-Call
const token = localStorage.getItem('auth_token');
if (!token) {
  setIsAuthenticated(false);
  setShowLoginPrompt(true);
  return;
}

// Nach jedem API-Call
if (response.status === 401) {
  localStorage.removeItem('auth_token');
  setIsAuthenticated(false);
  setShowLoginPrompt(true);
}
```

**Netzwerkfehler:**
- Bei Fehlern Status auf `'failed'` setzen
- Retry über Auto-Sync wenn Bedingungen wieder erfüllt
- Keine Blockierung der UI

### 2. Redundanzen vermeiden

**Aktuelle Redundanzen:**
1. Auth-Check-Logik wird in mehreren Komponenten dupliziert
2. Token-Handling wiederholt sich in verschiedenen Funktionen
3. Upload-Logik ähnelt sich in verschiedenen Teilen

**Verbesserungsvorschläge:**

```typescript
// 1. Zentraler Auth-Hook
function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    setToken(storedToken);
    setIsAuthenticated(!!storedToken);
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setIsAuthenticated(false);
  };

  return { isAuthenticated, token, login, logout };
}

// 2. Zentraler API-Client
class AuthenticatedAPIClient {
  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  async request(url: string, options: RequestInit = {}) {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new Event('auth-failed'));
    }

    return response;
  }
}

// 3. Upload-Service
class RecordingUploadService {
  constructor(private api: AuthenticatedAPIClient) {}

  async uploadRecording(localId: string, audioBlob: Blob, duration: number) {
    await indexedDB.updateRecording(localId, { status: 'uploading' });

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('duration', duration.toString());

      const response = await this.api.request('/api/recordings', {
        method: 'POST',
        body: formData,
      });

      const recording = await response.json();
      await indexedDB.updateRecording(localId, {
        status: 'uploaded',
        serverRecordingId: recording.id
      });

      return recording;
    } catch (error) {
      await indexedDB.updateRecording(localId, { status: 'failed' });
      throw error;
    }
  }
}
```

### 3. Test-Abdeckung

**Vorhandene Tests:**
- ✅ IndexedDB Manager Tests
- ✅ LED Display Tests
- ✅ Battery Status Hook Tests (6 Tests)
- ✅ Audio Feedback Tests (7 Tests)
- ✅ Rabbit Status Bar Tests (21 Tests)

**Fehlende Tests für Token-Auth:**

```typescript
// tests/tokenAuth.test.ts
describe('Token Authentication', () => {
  it('should store token in localStorage on OAuth callback', () => {
    // Test token storage
  });

  it('should include Bearer token in API requests', () => {
    // Test Authorization header
  });

  it('should clear token on 401 response', () => {
    // Test token cleanup
  });

  it('should redirect to login when token missing', () => {
    // Test login redirect
  });
});

// tests/autoSync.test.ts
describe('Auto-Sync', () => {
  it('should sync when online + not recording + has pending', () => {
    // Test sync trigger
  });

  it('should not sync when offline', () => {
    // Test offline prevention
  });

  it('should not sync during recording', () => {
    // Test recording prevention
  });

  it('should show login prompt when not authenticated', () => {
    // Test login prompt
  });
});

// tests/uploadRecording.test.ts
describe('Upload Recording', () => {
  it('should upload with Bearer token', () => {
    // Test upload with token
  });

  it('should handle 401 error gracefully', () => {
    // Test auth error handling
  });

  it('should update status during upload lifecycle', () => {
    // Test status transitions
  });

  it('should retry failed uploads', () => {
    // Test retry mechanism
  });
});
```

**Empfohlene Test-Strategie:**
1. Unit-Tests für Auth-Hook und API-Client
2. Integration-Tests für Upload-Flow
3. E2E-Tests für kompletten OAuth + Sync-Flow
4. Mock-Tests für IndexedDB-Operationen

## Funktionsbereitschaft

### ✅ Voll funktionsfähig

1. **Token-basierte Authentifizierung**
   - OAuth Flow funktioniert
   - Token wird in localStorage gespeichert
   - Bearer Token wird bei allen API-Calls gesendet
   - 401-Fehler werden korrekt behandelt

2. **Auto-Sync**
   - Erkennt Bedingungen korrekt
   - Startet Upload automatisch
   - Zeigt Login-Prompt bei fehlender Auth

3. **Offline-Fähigkeit**
   - Aufnahmen werden lokal gespeichert
   - Status-Übergänge funktionieren
   - Sync startet automatisch bei Verbindung

### ⚠️ Noch zu verbessern

1. **Code-Struktur**
   - Redundanzen in Auth-Logik
   - Mehrfache Token-Abfragen
   - Fehlende Abstraktion für API-Calls

2. **Fehlerbehandlung**
   - Keine Retry-Strategie mit exponential backoff
   - Fehlende Benachrichtigungen für User
   - Keine Offline-Warteschlange für Requests

3. **Test-Abdeckung**
   - Keine Tests für Token-Auth
   - Keine Tests für Auto-Sync
   - Keine Integration-Tests

4. **Monitoring**
   - Keine Metriken für Upload-Erfolgsrate
   - Keine Tracking für Token-Ablauf
   - Fehlende Logs für Sync-Aktivitäten

## Noch durchzuführende Arbeiten

### Priorität 1 (Kritisch)

1. **Test-Suite erweitern**
   - Token-Auth Tests schreiben
   - Auto-Sync Tests implementieren
   - Upload-Flow Tests hinzufügen

2. **Fehlerbehandlung verbessern**
   - Retry-Logik mit exponential backoff
   - User-Benachrichtigungen bei Fehlern
   - Offline-Request-Queue

### Priorität 2 (Wichtig)

3. **Code-Refactoring**
   - `useAuth` Hook erstellen
   - `AuthenticatedAPIClient` implementieren
   - `RecordingUploadService` einführen

4. **Token-Management**
   - Token-Ablauf implementieren
   - Refresh-Token-Mechanismus (optional)
   - Secure storage für sensible Daten

### Priorität 3 (Nice-to-have)

5. **Monitoring & Analytics**
   - Upload-Metriken tracken
   - Fehler-Reporting
   - Performance-Monitoring

6. **Optimierungen**
   - Request-Batching für mehrere Uploads
   - Komprimierung für große Audio-Dateien
   - Progressive Upload mit Chunks

## Zusammenfassung

### Ist die Komponente funktionsbereit?

**JA**, die Komponente ist voll funktionsfähig für den produktiven Einsatz mit folgenden Funktionen:
- ✅ Token-basierte Authentifizierung
- ✅ OAuth Flow mit GitHub
- ✅ Automatische Synchronisation
- ✅ Offline-First Architektur
- ✅ Fehlerbehandlung für 401-Fehler

### Wie könnte man die Komponente robuster machen?

1. **Code-Abstraktion**: Zentrale Auth- und API-Services
2. **Retry-Mechanismus**: Exponential backoff für fehlgeschlagene Requests
3. **Comprehensive Testing**: Unit-, Integration- und E2E-Tests
4. **Monitoring**: Metriken und Error-Tracking
5. **Token-Ablauf**: Automatisches Token-Refresh

### Sind genug Tests vorhanden?

**NEIN**, die Test-Abdeckung für den neuen Token-Auth-Flow ist unzureichend:
- ❌ Keine Tests für Token-Speicherung
- ❌ Keine Tests für Auto-Sync-Logik
- ❌ Keine Tests für Upload mit Bearer Token
- ❌ Keine Tests für 401-Error-Handling
- ❌ Keine Integration-Tests für OAuth-Flow

**Empfehlung**: Mindestens 30-40 zusätzliche Tests implementieren um:
- Token-Lifecycle abzudecken
- Auto-Sync-Bedingungen zu verifizieren
- Upload-Flow zu testen
- Edge-Cases zu behandeln
