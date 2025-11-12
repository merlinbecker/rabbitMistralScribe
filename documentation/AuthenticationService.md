# Authentication Service

## Übersicht

Der `AuthenticationService` ist ein zentraler Service zur Verwaltung der GitHub OAuth2-Authentifizierung in der Audio Notes App. Er kapselt alle authentifizierungsbezogenen Operationen und bietet eine klare, gut getestete Schnittstelle.

## Architektur

### Dependency Injection

Der Service wird als Singleton erstellt und über Dependency Injection in die Express-Routes eingebunden:

```typescript
import { AuthenticationService } from './authenticationService';
import { storage } from './storage';

// Service-Instanz mit Storage-Abhängigkeit
const authService = new AuthenticationService(storage);
```

### Hauptkomponenten

```
┌─────────────────────────────────┐
│   Express Routes (routes.ts)    │
│  - OAuth Endpoints              │
│  - Auth Middleware              │
└────────────┬────────────────────┘
             │
             │ verwendet
             ▼
┌─────────────────────────────────┐
│   AuthenticationService         │
│  - OAuth Flow                   │
│  - Session Management           │
│  - User Verification            │
└────────────┬────────────────────┘
             │
             │ nutzt
             ▼
┌─────────────────────────────────┐
│   Storage (IStorage)            │
│  - User CRUD                    │
│  - Settings Management          │
└─────────────────────────────────┘
```

## Service-Schnittstelle

### Konfiguration

#### `isConfigured(): boolean`

Prüft, ob GitHub OAuth korrekt konfiguriert ist (CLIENT_ID und CLIENT_SECRET vorhanden).

**Verwendung:**
```typescript
if (!authService.isConfigured()) {
  return res.status(500).send('OAuth not configured');
}
```

### OAuth-Flow

#### `getAuthorizationUrl(req: Request): string | null`

Generiert die GitHub OAuth-Autorisierungs-URL.

**Parameter:**
- `req`: Express Request-Objekt (für Protocol/Host-Extraktion)

**Rückgabe:**
- OAuth-URL oder `null` wenn nicht konfiguriert

**Verwendung:**
```typescript
const authUrl = authService.getAuthorizationUrl(req);
if (authUrl) {
  res.redirect(authUrl);
}
```

#### `authenticateWithCode(code: string): Promise<AuthenticationResult>`

Führt den kompletten OAuth-Flow aus:
1. Tauscht Authorization Code gegen Access Token
2. Holt User-Informationen von GitHub
3. Erstellt oder aktualisiert User in der Datenbank
4. Erstellt Default-Settings für neue User

**Parameter:**
- `code`: Authorization Code von GitHub

**Rückgabe:**
```typescript
interface AuthenticationResult {
  success: boolean;
  user?: User;
  error?: string; // 'no_token' | 'oauth_failed' | 'user_creation_failed'
}
```

**Verwendung:**
```typescript
const result = await authService.authenticateWithCode(code);
if (result.success && result.user) {
  await authService.createSession(req, result.user.id);
  res.redirect('/?authenticated=true');
} else {
  res.redirect(`/?error=${result.error}`);
}
```

### Session-Management

#### `createSession(req: Request, userId: string): Promise<void>`

Erstellt eine Session für den authentifizierten User.

**Race Condition Schutz:**
- Verwendet `req.session.save()` mit Callback
- Wartet auf Persistierung bevor Promise resolved
- Verhindert Redirects vor Session-Speicherung

**Verwendung:**
```typescript
try {
  await authService.createSession(req, userId);
  res.redirect('/dashboard');
} catch (error) {
  res.redirect('/?error=session_failed');
}
```

#### `destroySession(req: Request): Promise<void>`

Zerstört die User-Session (Logout).

**Verwendung:**
```typescript
try {
  await authService.destroySession(req);
  res.json({ success: true });
} catch (error) {
  res.status(500).json({ error: 'Logout failed' });
}
```

### User-Authentifizierung

#### `getUserIdFromRequest(req: Request): string | null`

Extrahiert die User-ID aus dem Request.

**Priorität:**
1. Session (`req.session.userId`)
2. Bearer Token (`Authorization: Bearer <token>`)

**Verwendung:**
```typescript
const userId = authService.getUserIdFromRequest(req);
if (!userId) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

#### `verifyUser(userId: string): Promise<User | null>`

Verifiziert, ob ein User existiert.

**Verwendung:**
```typescript
const user = await authService.verifyUser(userId);
if (!user) {
  return res.status(401).json({ error: 'User not found' });
}
```

#### `getSafeUser(userId: string): Promise<Omit<User, 'accessToken'> | null>`

Holt User-Daten ohne sensible Informationen (Access Token).

**Verwendung:**
```typescript
const safeUser = await authService.getSafeUser(userId);
res.json(safeUser);
```

#### `authenticateRequest(req: Request): Promise<User | null>`

High-Level Middleware-Helper für Request-Authentifizierung.

**Funktionalität:**
- Extrahiert User-ID aus Request
- Verifiziert User-Existenz
- Aktualisiert Session für Konsistenz

**Verwendung:**
```typescript
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authService.authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

## Race Conditions & Thread-Safety

### Konzepte zur Minimierung von Race Conditions

#### 1. Session-Persistierung
**Problem:** Session wird erstellt, aber nicht gespeichert bevor Redirect erfolgt.

**Lösung:**
```typescript
async createSession(req: Request, userId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.userId = userId;
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
```

Der Promise-basierte Ansatz stellt sicher, dass der Caller auf die Persistierung wartet.

#### 2. User-Upsert (Create or Update)
**Problem:** Zwei gleichzeitige OAuth-Callbacks könnten versuchen, denselben User zu erstellen.

**Lösung:**
- `getUserByGitHubId()` prüft Existenz
- Bei existierendem User: Update statt Create
- Datenbank-Constraints verhindern Duplikate

```typescript
private async upsertUser(githubUser: GitHubUser, accessToken: string): Promise<User> {
  let user = await this.storage.getUserByGitHubId(githubId);
  
  if (!user) {
    // Create new user - DB constraint verhindert Duplikate
    user = await this.storage.createUser(insertUser);
    await this.storage.createUserSettings({...});
  } else {
    // Update existing user
    if (user.accessToken !== accessToken) {
      user = await this.storage.updateUser(user.id, { accessToken });
    }
  }
  
  return user;
}
```

#### 3. Atomare Operationen
Alle Datenbank-Operationen sind atomar:
- User-Create: Einzelne Transaction
- Settings-Create: Einzelne Transaction
- Session-Update: Einzelne Transaction

#### 4. Single-User Context
Im typischen OAuth-Flow:
- Ein User authentifiziert sich
- Kein Concurrent Access auf dieselben Daten
- Session ist user-spezifisch

**Fazit:** Race Conditions sind in diesem Auth-Flow minimal, da:
- Operationen atomar sind
- Session-Persistierung synchronisiert ist
- User-Upsert idempotent ist
- Kein Shared State zwischen Users existiert

## Tests

### Test-Struktur

Die Tests sind in logische Gruppen organisiert:

```
tests/authenticationService.test.ts
├── Configuration (3 tests)
├── Authorization URL Generation (3 tests)
├── OAuth Authentication Flow (5 tests)
├── Session Management (4 tests)
├── User ID Extraction (5 tests)
├── User Verification (3 tests)
├── Safe User Retrieval (2 tests)
└── Request Authentication (5 tests)
```

**Total: 30 Tests, alle bestanden ✅**

### Wichtige Test-Cases

#### 1. OAuth Flow Tests

**Erfolgreicher Flow:**
```typescript
it('should successfully authenticate with valid code', async () => {
  // Mocks für GitHub API
  // Verifiziert: Token-Exchange, User-Fetch, User-Creation, Settings-Creation
});
```

**Token-Update für existierende User:**
```typescript
it('should update existing user access token', async () => {
  // Verifiziert: User wird aktualisiert statt neu erstellt
  // Access Token wird aktualisiert bei Änderung
});
```

**Fehlerbehandlung:**
```typescript
it('should handle token exchange failure');
it('should handle GitHub API failure');
it('should handle user creation failure');
```

#### 2. Session Management Tests

**Session-Erstellung:**
```typescript
it('should create session successfully', async () => {
  // Verifiziert: userId gesetzt, save() aufgerufen
});
```

**Fehlerbehandlung:**
```typescript
it('should handle session save error', async () => {
  // Verifiziert: Promise wird rejected bei Fehler
});
```

#### 3. User ID Extraction Tests

**Priorität und Fallbacks:**
```typescript
it('should extract user ID from session');
it('should extract user ID from Bearer token');
it('should prefer session over Bearer token'); // Wichtig!
```

**Robustheit:**
```typescript
it('should return null when no authentication present');
it('should ignore malformed authorization header');
```

#### 4. Request Authentication Tests

**Integration:**
```typescript
it('should authenticate request with valid session');
it('should authenticate request with Bearer token');
it('should update session with userId from Bearer token');
```

### Test-Qualität

**Fokus auf:**
- ✅ **Funktionalität:** Alle Haupt-Use-Cases abgedeckt
- ✅ **Edge Cases:** Fehlerbehandlung, ungültige Inputs
- ✅ **Race Conditions:** Session-Persistierung getestet
- ✅ **Security:** Safe User ohne Access Token
- ✅ **Integration:** Request Authentication End-to-End

**Nicht getestet:**
- HTTP-Integration (Express-Router-Level)
- Reale GitHub API-Calls
- Datenbank-Persistence

Diese werden durch Integration-Tests auf höherer Ebene abgedeckt.

## Verwendungsbeispiele

### 1. OAuth Login Flow

```typescript
// Initiiere Login
app.get('/api/auth/github', (req, res) => {
  if (!authService.isConfigured()) {
    return res.status(500).send('OAuth not configured');
  }
  
  const authUrl = authService.getAuthorizationUrl(req);
  res.redirect(authUrl);
});

// OAuth Callback
app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect('/?error=no_code');
  }
  
  const result = await authService.authenticateWithCode(code);
  
  if (!result.success || !result.user) {
    return res.redirect(`/?error=${result.error}`);
  }
  
  try {
    await authService.createSession(req, result.user.id);
    res.redirect(`/?authenticated=true&token=${result.user.id}`);
  } catch (error) {
    res.redirect('/?error=session_failed');
  }
});
```

### 2. Authentication Middleware

```typescript
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await authService.authenticateRequest(req);
  
  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
  }
  
  next();
}

// Verwendung
app.get('/api/protected', requireAuth, async (req, res) => {
  // User ist authentifiziert
  res.json({ message: 'Protected resource' });
});
```

### 3. Get Current User

```typescript
app.get('/api/auth/user', async (req, res) => {
  const userId = authService.getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const safeUser = await authService.getSafeUser(userId);
  
  if (!safeUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(safeUser);
});
```

### 4. Logout

```typescript
app.post('/api/auth/logout', async (req, res) => {
  try {
    await authService.destroySession(req);
    res.json({ success: true, clearToken: true });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});
```

## Migration von altem Code

### Vorher (routes.ts)

```typescript
// Direkter OAuth-Code in Routes
app.get('/api/auth/github/callback', async (req, res) => {
  // 80+ Zeilen OAuth-Logik
  // Token-Exchange
  // User-Fetch
  // User-Create/Update
  // Settings-Create
  // Session-Erstellung
  // Fehlerbehandlung
});

// Middleware mit duplizierter Logik
async function requireAuth(req, res, next) {
  let userId = req.session.userId;
  
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    }
  }
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  req.session.userId = userId;
  next();
}
```

### Nachher (mit AuthenticationService)

```typescript
// Klare Service-Nutzung
app.get('/api/auth/github/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect('/?error=no_code');
  }
  
  const result = await authService.authenticateWithCode(code);
  
  if (!result.success || !result.user) {
    return res.redirect(`/?error=${result.error}`);
  }
  
  await authService.createSession(req, result.user.id);
  res.redirect('/?authenticated=true');
});

// Vereinfachte Middleware
async function requireAuth(req, res, next) {
  const user = await authService.authenticateRequest(req);
  
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}
```

### Vorteile

1. **Code-Reduktion:** ~150 Zeilen Auth-Code → ~30 Zeilen Service-Nutzung
2. **Testbarkeit:** Service isoliert testbar (30 Unit-Tests)
3. **Wartbarkeit:** Zentrale Fehlerbehandlung und Logging
4. **Wiederverwendbarkeit:** Service in verschiedenen Contexts nutzbar
5. **Separation of Concerns:** Routes orchestrieren, Service implementiert

## Best Practices

### 1. Service als Singleton verwenden

```typescript
// ✅ Gut: Singleton-Instanz
const authService = new AuthenticationService(storage);

// ❌ Schlecht: Multiple Instanzen
function handler(req, res) {
  const authService = new AuthenticationService(storage); // Nicht performant
}
```

### 2. Dependency Injection nutzen

```typescript
// ✅ Gut: Storage wird injiziert
const authService = new AuthenticationService(storage);

// ❌ Schlecht: Direkte Abhängigkeit
class AuthenticationService {
  constructor() {
    this.storage = new ReplitStorage(); // Schwer testbar
  }
}
```

### 3. Fehlerbehandlung auf Route-Level

```typescript
// ✅ Gut: Fehler im Route-Handler behandeln
app.get('/api/auth/user', async (req, res) => {
  try {
    const userId = authService.getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // ...
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ❌ Schlecht: Unbehandelte Promise-Rejects
app.get('/api/auth/user', async (req, res) => {
  const user = await authService.getSafeUser(userId); // Kann rejecten!
  res.json(user);
});
```

### 4. Safe User für Frontend

```typescript
// ✅ Gut: Nutze getSafeUser() für Frontend-Responses
const safeUser = await authService.getSafeUser(userId);
res.json(safeUser); // Kein accessToken

// ❌ Schlecht: Vollständigen User senden
const user = await authService.verifyUser(userId);
res.json(user); // Enthält accessToken!
```

## Troubleshooting

### Problem: "OAuth not configured" Error

**Ursache:** Umgebungsvariablen fehlen

**Lösung:**
```bash
# Setze in Replit Secrets oder .env
GITHUB_CLIENT_ID=<your_client_id>
GITHUB_CLIENT_SECRET=<your_client_secret>
```

### Problem: Session wird nicht persistiert

**Ursache:** `createSession()` wird nicht awaited

**Lösung:**
```typescript
// ❌ Falsch
authService.createSession(req, userId);
res.redirect('/'); // Session noch nicht gespeichert!

// ✅ Richtig
await authService.createSession(req, userId);
res.redirect('/'); // Session ist gespeichert
```

### Problem: 401 Unauthorized trotz Login

**Ursache 1:** Bearer Token im localStorage abgelaufen

**Lösung:**
```typescript
// Client: Token-Validierung
const stored = localStorage.getItem('auth_token');
const { token, expiresAt } = JSON.parse(stored);
if (new Date(expiresAt) < new Date()) {
  localStorage.removeItem('auth_token');
  window.location.href = '/auth';
}
```

**Ursache 2:** User existiert nicht mehr

**Lösung:** User muss sich neu anmelden

### Problem: Tests schlagen fehl

**Ursache:** Umgebungsvariablen nicht gesetzt

**Lösung:**
```typescript
beforeEach(() => {
  process.env.GITHUB_CLIENT_ID = 'test_client_id';
  process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
});
```

## Weiterentwicklung

### Geplante Features

1. **Token Refresh Mechanismus**
   - Automatische Token-Erneuerung
   - Hintergrund-Refresh ohne User-Interaktion

2. **JWT-basierte Tokens**
   - Ersetze einfache User-IDs durch JWTs
   - Signierte Tokens mit Expiration

3. **Multi-Factor Authentication**
   - TOTP-Support
   - Backup-Codes

4. **Session Management UI**
   - Aktive Sessions anzeigen
   - Remote-Logout für einzelne Sessions

5. **Audit Logging**
   - Login-History
   - Failed Login-Attempts
   - Security Events

### Erweiterungspunkte

Der Service ist designed für Erweiterungen:

```typescript
// Beispiel: JWT-Token-Support
class AuthenticationService {
  async generateJWT(userId: string): Promise<string> {
    // JWT-Generierung
  }
  
  async verifyJWT(token: string): Promise<User | null> {
    // JWT-Verifikation
  }
}
```

## Referenzen

- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Express Session Best Practices](https://github.com/expressjs/session#readme)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
