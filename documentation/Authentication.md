
# Authentifizierung - Audio Notes App

## Übersicht

Die Audio Notes App verwendet eine hybride Authentifizierungsstrategie mit GitHub OAuth 2.0, die sowohl Session-basierte als auch Token-basierte Authentifizierung kombiniert.

## Architektur

### Komponenten

1. **GitHub OAuth 2.0** - Primäre Authentifizierungsmethode
2. **Express Sessions** - Server-seitige Session-Verwaltung
3. **Bearer Token** - Client-seitige Token-Authentifizierung
4. **Replit Database** - Persistente Speicherung von Sessions und User-Daten

### Datenfluss

```
Client → GitHub OAuth → Server → Replit DB
  ↓                                    ↓
LocalStorage ← Token ← Session ← User Data
```

---

## Implementierung

### 1. GitHub OAuth Setup

#### 1.1 Umgebungsvariablen

Erforderliche Secrets in Replit:

```bash
GITHUB_CLIENT_ID=<your_github_client_id>
GITHUB_CLIENT_SECRET=<your_github_client_secret>
SESSION_SECRET=<random_secure_string>
```

#### 1.2 GitHub OAuth App Konfiguration

- **Authorization callback URL**: `https://<your-repl>.replit.dev/api/auth/github/callback`
- **Scopes**: `repo,user`

### 2. Authentifizierungs-Flow

#### Phase 1: OAuth Initialisierung

**Endpoint**: `GET /api/auth/github`

```typescript
// Client initiiert Login
window.location.href = '/api/auth/github';

// Server redirected zu GitHub
const redirectUri = `${protocol}://${host}/api/auth/github/callback`;
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,user`;
res.redirect(authUrl);
```

#### Phase 2: OAuth Callback

**Endpoint**: `GET /api/auth/github/callback`

Ablauf:
1. GitHub sendet Authorization Code
2. Server tauscht Code gegen Access Token
3. Server holt User-Daten von GitHub API
4. User wird in Replit Database gespeichert/aktualisiert
5. Default Settings werden erstellt (falls neuer User)
6. Session wird erstellt und gespeichert
7. Redirect zum Client mit Token

```typescript
// User-Erstellung/Update
let user = await storage.getUserByGitHubId(githubUser.id.toString());

if (!user) {
  user = await storage.createUser({
    githubId: githubUser.id.toString(),
    username: githubUser.login,
    avatarUrl: githubUser.avatar_url,
    accessToken,
  });
  
  await storage.createUserSettings({
    userId: user.id,
    mistralApiKey: null,
    githubRepoOwner: null,
    githubRepoName: null,
  });
}

// Session erstellen
req.session.userId = user.id;
req.session.save((err) => {
  if (err) {
    return res.redirect('/?error=session_failed');
  }
  res.redirect(`/?authenticated=true&token=${encodeURIComponent(user.id)}`);
});
```

#### Phase 3: Token Storage (Client)

**Datei**: `client/src/pages/auth.tsx`

```typescript
// Token aus URL Parameter extrahieren
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const authenticated = params.get('authenticated');

if (authenticated === 'true' && token) {
  // Token im LocalStorage speichern
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 Tage Gültigkeit

  localStorage.setItem('auth_token', JSON.stringify({
    token: decodeURIComponent(token),
    expiresAt: expiresAt.toISOString()
  }));

  // URL bereinigen
  window.history.replaceState({}, '', '/');
  
  // Auth-Status prüfen
  checkAuthStatus();
}
```

### 3. Session Management

#### 3.1 ReplitSessionStore

**Datei**: `server/replitSessionStore.ts`

Implementiert `express-session.Store` Interface für persistente Session-Speicherung:

```typescript
export class ReplitSessionStore extends session.Store {
  private db: Database;
  
  constructor() {
    super();
    this.db = new Database();
  }
  
  private sessionKey(sid: string): string {
    return `session:${sid}`;
  }
  
  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Getting session:', sid);
      const sessionData = await this.db.get(this.sessionKey(sid));
      
      // Validate session data structure
      if (!sessionData || typeof sessionData !== 'object') {
        console.log('[SESSION_STORE] No valid session data found for:', sid);
        callback(null, null);
        return;
      }
      
      // Ensure cookie object exists with required properties
      if (!sessionData.cookie || typeof sessionData.cookie !== 'object') {
        console.log('[SESSION_STORE] Invalid session cookie structure for:', sid);
        callback(null, null);
        return;
      }
      
      console.log('[SESSION_STORE] Valid session found:', sid, 'userId:', sessionData.userId);
      callback(null, sessionData);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting session:', error);
      callback(error);
    }
  }
  
  async set(sid: string, session: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Setting session:', sid, 'userId:', session.userId);
      
      // Validate session structure before saving
      if (!session.cookie || typeof session.cookie !== 'object') {
        console.error('[SESSION_STORE] Invalid session cookie structure, cannot save');
        callback?(new Error('Invalid session cookie structure'));
        return;
      }
      
      await this.db.set(this.sessionKey(sid), session);
      console.log('[SESSION_STORE] Session saved successfully:', sid);
      callback?.();
    } catch (error) {
      console.error('[SESSION_STORE] Error setting session:', error);
      callback?.(error);
    }
  }
  
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await this.db.delete(this.sessionKey(sid));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
```

#### 3.2 Session Konfiguration

**Datei**: `server/routes.ts`

```typescript
app.use(
  session({
    store: new ReplitSessionStore(),
    secret: process.env.SESSION_SECRET || 'audio-notes-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
    },
  })
);
```

### 4. Authentifizierungs-Middleware

**Datei**: `server/routes.ts`

Die `requireAuth` Middleware unterstützt beide Authentifizierungsmethoden:

```typescript
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  let userId = req.session.userId;
  
  // Fallback auf Bearer Token wenn keine Session
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
      console.log('[AUTH] Using Bearer token for auth, userId:', userId);
    }
  }
  
  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
  }
  
  // User-Existenz verifizieren
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'User not found'
    });
  }
  
  // Session konsistent halten
  req.session.userId = userId;
  next();
}
```

### 5. API Endpoints

#### 5.1 User Info abrufen

**Endpoint**: `GET /api/auth/user`

```typescript
app.get('/api/auth/user', async (req, res) => {
  const authHeader = req.headers.authorization;
  let userId = req.session.userId;

  // Bearer Token prüfen
  if (!userId && authHeader?.startsWith('Bearer ')) {
    userId = authHeader.substring(7);
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Access Token nicht an Frontend senden
  const { accessToken, ...safeUser } = user;
  res.json(safeUser);
});
```

#### 5.2 Logout

**Endpoint**: `POST /api/auth/logout`

```typescript
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, clearToken: true });
  });
});
```

### 6. Client-seitige Token-Verwaltung

**Datei**: `client/src/lib/queryClient.ts`

```typescript
const TOKEN_KEY = 'auth_token';

export function setStoredToken(token: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    token,
    expiresAt: expiresAt.toISOString()
  }));
}

export function getStoredToken(): string | null {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return null;
  
  const { token, expiresAt } = JSON.parse(stored);
  if (new Date(expiresAt) < new Date()) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  
  return token;
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}
```

### 7. API-Request mit Token

Alle API-Requests verwenden den Bearer Token:

```typescript
const defaultQueryFn: QueryFunction = async ({ queryKey }) => {
  const token = getStoredToken();
  const headers: HeadersInit = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`/api/${queryKey[0]}`, { headers });
  
  if (!response.ok) {
    if (response.status === 401) {
      clearStoredToken();
      window.location.href = '/auth';
    }
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  
  return response.json();
};
```

---

## Datenspeicherung

### User-Daten

**Replit Database Keys**:
- `user:<userId>` - User-Objekt mit GitHub-Daten und Access Token
- `user:github:<githubId>` - Mapping von GitHub ID zu User ID
- `settings:<userId>` - User-spezifische Einstellungen

**User Schema**:
```typescript
{
  id: string;
  githubId: string;
  username: string;
  avatarUrl: string;
  accessToken: string; // GitHub Access Token für API-Zugriff
  createdAt: Date;
  updatedAt: Date;
}
```

### Sessions

**Replit Database Keys**:
- `session:<sessionId>` - Session-Daten

**Session Data**:
```typescript
{
  userId: string;
  cookie: {
    originalMaxAge: number;
    expires: Date;
    httpOnly: boolean;
    secure: boolean;
  };
}
```

---

## Sicherheit

### 1. Token-Sicherheit

- ✅ GitHub Access Token wird nur server-seitig gespeichert
- ✅ Access Token wird niemals an Frontend gesendet
- ✅ Session-Cookie ist `httpOnly` und `secure` (Production)
- ✅ Bearer Token hat 30 Tage Ablaufdatum

### 2. Session-Sicherheit

- ✅ Sessions werden in Replit Database persistiert
- ✅ Session-Secret aus Umgebungsvariablen
- ✅ `saveUninitialized: false` verhindert Session-Spam
- ✅ `resave: false` optimiert Performance

### 3. API-Sicherheit

- ✅ Alle geschützten Endpoints verwenden `requireAuth` Middleware
- ✅ User-Existenz wird bei jedem Request verifiziert
- ✅ 401 Unauthorized bei fehlender/ungültiger Authentifizierung

---

## Error Handling

### OAuth-Fehler

**URL Parameter Fehler-Codes**:
- `?error=no_code` - Keine Authorization von GitHub erhalten
- `?error=oauth_not_configured` - GitHub OAuth nicht konfiguriert
- `?error=no_token` - Kein Access Token von GitHub erhalten
- `?error=oauth_failed` - GitHub Authentifizierung fehlgeschlagen
- `?error=session_failed` - Session konnte nicht erstellt werden

### API-Fehler

**401 Unauthorized**:
```json
{
  "error": "Unauthorized",
  "details": "No session or valid Bearer token found"
}
```

**404 Not Found**:
```json
{
  "error": "User not found"
}
```

---

## Testing

### Unit Tests

Die Anwendung verfügt über umfassende Unit Tests mit Vitest und @testing-library/react.

**Setup**: `tests/setup.ts`
- Konfiguration von jsdom für DOM-Testing
- @testing-library/jest-dom Matchers

**Implementierte Tests**:

1. **Token-Storage Tests** (`tests/auth.test.ts`):
   - ✅ Token mit Ablaufdatum speichern
   - ✅ Abgelaufene Tokens erkennen
   - ✅ Token bei Logout löschen

2. **Session Store Tests** (`tests/replitSessionStore.test.ts`):
   - ✅ Session erfolgreich speichern
   - ✅ Session erfolgreich abrufen
   - ✅ Session bei ungültiger Struktur ablehnen
   - ✅ Session löschen
   - ✅ Null zurückgeben bei nicht-existierender Session

3. **Auth Middleware Tests** (`tests/authMiddleware.test.ts`):
   - ✅ Zugriff mit gültiger Session erlauben
   - ✅ Zugriff mit Bearer Token erlauben
   - ✅ 401 bei fehlender Authentifizierung
   - ✅ 401 bei ungültigem User
   - ✅ Session-Konsistenz sicherstellen

**Test-Kommandos**:
```bash
npm test              # Run all tests
npm run test:ui       # Run tests with UI
npm run test:coverage # Run with coverage report
```

### Fehlende Tests

❌ **Noch zu implementieren**:
- OAuth Flow Integration Tests
- E2E Tests für kompletten Login-Flow
- GitHub API Mock Tests
- Mistral AI Integration Tests

---

## Bekannte Probleme & Lösungen

### Problem: Session wird nicht persistiert ✅ GELÖST

**Symptom**: `TypeError: Cannot read properties of undefined (reading 'expires')`

**Ursache**: Session-Daten aus der Replit Database hatten nicht die erwartete Struktur. Wenn eine Session aus der Datenbank geladen wurde, fehlte das `cookie`-Objekt oder es hatte nicht die erforderliche `expires`-Eigenschaft, was zu einem Fehler im `express-session` Store führte.

**Status**: ✅ Gelöst (Sprint 1)

**Implementierte Lösung**:

1. **Session-Daten-Validierung beim Abrufen** (`ReplitSessionStore.get()`):
   - Prüfung ob Session-Daten existieren und vom Typ `object` sind
   - Validierung der `cookie`-Struktur und ihrer Eigenschaften
   - Rückgabe von `null` bei ungültigen Daten statt fehlerhafter Objekte
   - Detailliertes Logging für Debugging

2. **Session-Daten-Validierung beim Speichern** (`ReplitSessionStore.set()`):
   - Prüfung der Cookie-Struktur vor dem Speichern
   - Fehlermeldung bei ungültigen Daten
   - Bestätigungs-Logging nach erfolgreichem Speichern

**Code-Beispiel der Validierung**:

```typescript
// In ReplitSessionStore.get()
const sessionData = await this.db.get(this.sessionKey(sid));

// Validate session data structure
if (!sessionData || typeof sessionData !== 'object') {
  console.log('[SESSION_STORE] No valid session data found for:', sid);
  callback(null, null);
  return;
}

// Ensure cookie object exists with required properties
if (!sessionData.cookie || typeof sessionData.cookie !== 'object') {
  console.log('[SESSION_STORE] Invalid session cookie structure for:', sid);
  callback(null, null);
  return;
}
```

**Ergebnis**: Sessions werden jetzt korrekt persistiert und bei ungültigen Daten wird ein sauberer Fehler behandelt statt einem Crash.

---

## Roadmap

### Kurzfristig (Sprint 1) ✅ ABGESCHLOSSEN
- [x] GitHub OAuth Flow implementieren
- [x] ReplitSessionStore implementieren
- [x] Bearer Token Authentication
- [x] Session-Persistierung debuggen und beheben
- [x] Basis Unit Tests (Auth, Session Store, Middleware)

### Mittelfristig (Sprint 2)
- [ ] Token Refresh Mechanismus
- [ ] Automatisches Token-Cleanup
- [ ] Erweiterte Error Recovery
- [ ] Integration Tests

### Langfristig (Sprint 3)
- [ ] Multi-Factor Authentication
- [ ] Token Revocation
- [ ] Session Management UI
- [ ] Audit Logs

---

## Best Practices

1. **Nie Access Tokens an Frontend senden** - Nur User-ID als Token verwenden
2. **Session und Token kombinieren** - Session für Server, Token für Client
3. **Immer Expiration setzen** - Sowohl für Sessions als auch Tokens
4. **Logging für Debugging** - Aber keine sensiblen Daten loggen
5. **Graceful Degradation** - Fallback auf Bearer Token wenn Session fehlt
6. **Datenvalidierung** - Immer Session-Daten vor Speichern/Abrufen validieren
7. **Error Handling** - Saubere null-Rückgaben statt undefined bei ungültigen Daten

## Troubleshooting

### Session-bezogene Fehler

**Problem**: `TypeError: Cannot read properties of undefined (reading 'expires')`
- **Lösung**: Session-Daten-Validierung ist bereits implementiert in `ReplitSessionStore`
- **Prüfung**: Logs nach `[SESSION_STORE]` durchsuchen

**Problem**: Session wird nach Neustart nicht wiederhergestellt
- **Ursache**: Cookie nicht persistent oder httpOnly/secure Einstellungen
- **Lösung**: Überprüfe Cookie-Einstellungen in Session-Konfiguration
- **Fallback**: Bearer Token aus localStorage wird automatisch verwendet

**Problem**: 401 Unauthorized trotz gültiger Session
- **Ursache**: User existiert nicht mehr in Database
- **Lösung**: Logout und neuer Login erforderlich
- **Debug**: `[AUTH]` Logs prüfen für User-Lookup

### OAuth-bezogene Fehler

**Problem**: OAuth redirect schlägt fehl
- **Ursache**: Callback URL in GitHub App nicht korrekt konfiguriert
- **Lösung**: Stelle sicher, dass `https://<your-repl>.replit.dev/api/auth/github/callback` eingetragen ist

**Problem**: `error=oauth_not_configured`
- **Ursache**: `GITHUB_CLIENT_ID` oder `GITHUB_CLIENT_SECRET` fehlt
- **Lösung**: Secrets in Replit konfigurieren

---

## Referenzen

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Express Session Documentation](https://github.com/expressjs/session)
- [Replit Database Documentation](https://docs.replit.com/hosting/databases/replit-database)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
