# arc42 Architekturdokumentation: RabbitMistralScribe

**Version:** 1.0  
**Datum:** 18. November 2025  
**Status:** Konsolidierte Architekturdokumentation

---

## Über dieses Dokument

Diese Dokumentation folgt dem [arc42-Template](https://arc42.org/) und konsolidiert alle existierenden Dokumentationen aus `docs/`, `documentation/`, Root-Markdown-Dateien sowie Code-Kommentare.

**Quellen:**
- README.md, IMPLEMENTATION_SUMMARY.md, design_guidelines.md
- docs/: USER_GUIDE.md, TROUBLESHOOTING.md, StatusNotificationSystem.md
- documentation/: neuerAblauf.md, alle Service-Dokumentationen
- Plans/: furtherSteps.md, ANALYSIS_SUMMARY.md
- Codeanalyse aller TypeScript-Dateien

---

# 1. Einführung und Ziele

## 1.1 Aufgabenstellung

**RabbitMistralScribe** ist eine Progressive Web App (PWA) für Audio-Notizen mit automatischer Transkription und KI-gestützter Zusammenfassung, optimiert für das Rabbit R1 Gerät (240x282px Display).

### Kernfunktionalität
- 🎤 Audio-Aufnahme mit Echtzeit-LED-Frequenz-Visualisierung
- 📝 Automatische Transkription via Mistral Voxtral API
- 📊 KI-Zusammenfassung und automatische Titelerstellung
- 🐙 GitHub-Integration für Markdown-Export
- 📱 Offline-Support mit IndexedDB-Speicherung
- 🔄 Automatische Synchronisation bei Netzwerkverbindung
- 🔐 GitHub OAuth Authentifizierung

## 1.2 Qualitätsziele

| Priorität | Qualitätsmerkmal | Konkrete Ziele |
|-----------|------------------|----------------|
| 1 | **Verfügbarkeit** | Offline-Funktionalität, 99.9% Uptime Backend |
| 2 | **Benutzbarkeit** | Intuitive Bedienung auf 240x282px Display |
| 3 | **Performance** | Upload <5s, Transkription <30s, 60 FPS LED-Display |
| 4 | **Sicherheit** | OAuth2, HTTPS-only, BYOK für Mistral API |
| 5 | **Wartbarkeit** | Service-orientiert, >80% Test-Coverage, DI-Pattern |

## 1.3 Stakeholder

| Rolle | Erwartung |
|-------|-----------|
| **End-User** | Schnelle, zuverlässige Audio-Notizen |
| **Entwickler** | Klare Architektur, gute Tests, Erweiterbarkeit |
| **DevOps** | Einfaches Deployment, Monitoring |

---

# 2. Randbedingungen

## 2.1 Technische Constraints

| Constraint | Auswirkung |
|------------|------------|
| **Rabbit R1 Display** | 240x282px - UI muss extrem kompakt sein |
| **Browser APIs** | MediaRecorder, IndexedDB, Service Worker erforderlich |
| **Replit Platform** | Key-Value-Store Limits, keine relationale DB |
| **Mistral API BYOK** | User zahlt selbst, keine Kostenkontrolle durch App |
| **GitHub OAuth** | User benötigt GitHub-Account |
| **Node.js 20+** | TypeScript-Support, moderne Features |

## 2.2 Konventionen

- **Sprache:** TypeScript 5.6+
- **Testing:** Vitest (Unit), Playwright (E2E)
- **Dokumentation:** arc42 für Architektur, JSDoc für Code
- **Git:** Feature Branches, Semantic Commits

---

# 3. Kontextabgrenzung

## 3.1 Geschäftskontext

```
Nutzer (Rabbit R1)
    ↓
RabbitMistralScribe
    ├→ GitHub (OAuth + Repos)
    ├→ Mistral AI (Transkription)
    └→ Replit DB (Speicherung)
```

## 3.2 Technischer Kontext

**Client:** React 18, IndexedDB, Service Worker, MediaRecorder API  
**Server:** Express.js, Node.js 20+, TypeScript  
**Storage:** Replit Database (Key-Value)  
**APIs:** GitHub REST, Mistral AI REST

---

# 4. Lösungsstrategie

## 4.1 Architekturansatz

**Offline-First PWA** mit Service-orientierter Backend-Architektur:

1. **Client-seitig:** IndexedDB für lokale Speicherung, Service Worker für Caching
2. **Server-seitig:** Dependency Injection, Push-basiertes Job-Queue-System
3. **Asynchrone Verarbeitung:** Background Worker für Transkription
4. **BYOK-Strategie:** User bringt eigenen Mistral API Key mit

## 4.2 Wichtige Architekturentscheidungen

| Entscheidung | Begründung |
|--------------|------------|
| **Offline-First** | Rabbit R1 kann unterwegs sein, keine konstante Verbindung |
| **Push statt Polling** | Effizienter, weniger Server-Last |
| **BYOK** | Keine API-Kosten für Betreiber, User-Kontrolle |
| **Service-Architektur** | Testbarkeit, Wartbarkeit, Erweiterbarkeit |
| **TypeScript** | Type-Safety, bessere IDE-Unterstützung |

---

# 5. Bausteinsicht

## 5.1 Ebene 1: Systemübersicht

```
┌─────────────────────────────────────┐
│         Client (React PWA)          │
│  ┌──────────┐  ┌──────────────┐   │
│  │ UI Layer │  │ IndexedDB    │   │
│  └──────────┘  └──────────────┘   │
└────────────┬────────────────────────┘
             │ REST API
             ▼
┌─────────────────────────────────────┐
│      Express Server (Node.js)       │
│  ┌──────────┐  ┌──────────────┐   │
│  │ Services │  │ Job Queue    │   │
│  └──────────┘  └──────────────┘   │
└─────────────────────────────────────┘
```

## 5.2 Ebene 2: Services

### Backend Services

1. **AuthenticationService** (30 Tests)
   - GitHub OAuth2-Flow
   - Session-Management
   - User-Verwaltung

2. **DatabaseService** (23 Tests)
   - Abstraktion über Replit Database
   - CRUD-Operationen
   - Zentrale Datenzugriffsschicht

3. **MistralService** (18 Tests)
   - Audio-Transkription (Voxtral)
   - Text-Zusammenfassung (Large)
   - Titel-Generierung

4. **GitHubService** (16 Tests)
   - Repository-Listen
   - Markdown-Datei-Upload
   - OAuth-Token-Verwaltung

5. **JobQueue**
   - Push-basierte Job-Verwaltung
   - Retry-Logik (max 3 Versuche)
   - Status-Tracking

6. **TranscriptionWorker**
   - Background-Processing
   - Asynchrone Transkription
   - GitHub-Integration

### Client Components

1. **rabbit.tsx** - Hauptseite für Aufnahmen
2. **LEDPixelDisplay** - Echtzeit-Frequenz-Visualisierung
3. **RabbitStatusBar** - Status und Navigation
4. **ErrorBoundary** - Fehlerbehandlung
5. **IndexedDB Manager** - Lokale Speicherung

---

# 6. Laufzeitsicht

## 6.1 Audio-Aufnahme und Verarbeitung

```
1. User ruft Seite auf (rabbit.tsx)
   ↓
2. Token-Check (URL SearchParams)
   ↓
3. Internet-Check
   ├─ Nein: Offline-Modus (nur Aufnahme möglich)
   └─ Ja: Settings abrufen
       ├─ 401 Unauthorized: Login-Screen anzeigen
       ├─ Keine Settings (Mistral Key): Settings-Screen anzeigen
       └─ Settings OK: Bereit
   ↓
4. Aufnahme starten (max 13:37)
   ↓
5. Aufnahme stoppen -> LocalStorage (IndexedDB)
   ↓
6. Upload-Loop (wenn Online & Settings OK):
   ↓
7. Upload zu Server (POST /api/recordings)
   ↓
8. Server: Queue -> Transkription -> GitHub -> Löschen (Audio+Transkript)
   ↓
9. Client: Polling (alle 15s)
   ├─ Status 'pending': Warten
   └─ Status 'transcribed'/'failed':
      ↓
10. Client löscht lokale Aufnahme
```

## 6.2 Offline-Sync-Szenario

```
1. User offline: Aufnahmen → IndexedDB
   ↓
2. Device kommt online
   ↓
3. Prüfung: Auth OK? Settings OK?
   ↓
4. Upload aller queued Recordings
   ↓
5. Polling bis Completion
   ↓
6. Lokales Löschen
```

---

# 7. Verteilungssicht

## 7.1 Infrastruktur

```
┌─────────────────────┐
│   Client Devices    │
│ - Rabbit R1         │
│ - Mobile Browsers   │
│ - Desktop Browsers  │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│   Replit Hosting    │
│ - Express Server    │
│ - Replit Database   │
│ - Static Assets     │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐   ┌────────┐
│ GitHub │   │Mistral │
│  API   │   │  API   │
└────────┘   └────────┘
```

## 7.2 Deployment

**Plattform:** Replit  
**Runtime:** Node.js 20+  
**Build:** Vite (Client), esbuild (Server)  
**Process:** npm start (Production)

---

# 8. Querschnittliche Konzepte

## 8.1 Sicherheit

- **Authentifizierung:** OAuth2 via GitHub
- **Authorization:** Token-basiert (Bearer Token = userId)
- **HTTPS:** Mandatory in Production
- **API-Keys:** BYOK, gespeichert pro User
- **Session:** 30 Tage Gültigkeit

## 8.2 Error Handling

- **Client:** Error Boundary für React-Fehler
- **Server:** Try-Catch mit strukturiertem Logging
- **Retry:** Max 3 Versuche mit exponential backoff (geplant)
- **Offline:** Graceful Degradation, lokale Speicherung

## 8.3 Logging

- **Format:** `[COMPONENT] Symbol Message + Details`
- **Symbole:** 📥📤💾🔄✅❌⚠️🔍📊🚀🏁🔔🗑️
- **Bereiche:** Client (rabbit.tsx), Server (alle Services), Worker

## 8.4 Testing

**Strategie:**
- Unit-Tests für alle Services (106 Tests passing)
- Integration-Tests für API-Endpunkte
- E2E-Tests für kritische User-Flows (geplant)

**Coverage:** 
- AuthenticationService: 30 Tests
- DatabaseService: 23 Tests
- MistralService: 18 Tests
- GitHubService: 16 Tests
- Weitere: 19 Tests

---

# 9. Architekturentscheidungen

## ADR-001: Offline-First Architecture

**Status:** Akzeptiert  
**Kontext:** Rabbit R1 wird unterwegs genutzt, nicht immer online  
**Entscheidung:** IndexedDB für lokale Speicherung, Auto-Sync bei Verbindung  
**Konsequenzen:** (+) Offline-fähig, (-) Sync-Komplexität

## ADR-002: Push-based Job Queue

**Status:** Akzeptiert  
**Kontext:** Polling ineffizient für Transkriptions-Jobs  
**Entscheidung:** Worker-Notification bei neuem Job  
**Konsequenzen:** (+) Effizienter, (-) Komplexere Architektur

## ADR-003: BYOK für Mistral API

**Status:** Akzeptiert  
**Kontext:** API-Kosten sollen nicht beim Betreiber liegen  
**Entscheidung:** User bringt eigenen API Key  
**Konsequenzen:** (+) Keine Kosten, User-Kontrolle, (-) Setup-Aufwand

## ADR-004: Service-orientierte Architektur

**Status:** Akzeptiert  
**Kontext:** Wartbarkeit und Testbarkeit wichtig  
**Entscheidung:** Dependency Injection, Interface-basiert  
**Konsequenzen:** (+) Testbar, wartbar, (-) Mehr Boilerplate

## ADR-005: Replit Database als Storage

**Status:** Akzeptiert (Interim)  
**Kontext:** Schnelles Setup für MVP  
**Entscheidung:** Key-Value-Store für alle Daten  
**Konsequenzen:** (+) Einfach, (-) Limits, Migration zu Cloud Storage geplant

---

# 10. Qualitätsanforderungen

## 10.1 Qualitätsszenarien

### Verfügbarkeit

| Szenario | Ziel | Aktuell |
|----------|------|---------|
| Offline-Aufnahme | 100% funktionsfähig | ✅ Erfüllt |
| Service Worker | PWA-Cache aktiv | ✅ Erfüllt |
| Backend Uptime | >99% | ⚠️ Keine Metriken |

### Performance

| Szenario | Ziel | Aktuell |
|----------|------|---------|
| Audio-Upload (5 Min) | <5s | ⚠️ Nicht gemessen |
| Transkription (5 Min) | <30s | ⚠️ Abhängig von Mistral API |
| LED-Visualisierung | 60 FPS | ✅ Erfüllt |

### Security

| Szenario | Ziel | Aktuell |
|----------|------|---------|
| OAuth2 Flow | Standard-konform | ✅ Erfüllt |
| HTTPS only | Mandatory | ✅ In Production |
| Token Expiry | 7-30 Tage | ❌ Nie ablaufend (Issue!) |

## 10.2 Test-Coverage

**Aktuell:** 106 Tests passing (0 failures)
- Unit-Tests: ✅ Gut abgedeckt
- Integration-Tests: ⚠️ Teilweise
- E2E-Tests: ❌ Fehlen

**Benötigt für Production:**
- Token-Auth-Tests: 5-8 Tests
- Auto-Sync-Tests: 5-8 Tests
- Upload-Flow-Tests: 8-10 Tests
- **Summe:** ~60-75 zusätzliche Tests

---

# 11. Risiken und Technische Schulden

## 11.1 Risiken

### Hohe Risiken

| ID | Risiko | Auswirkung | Mitigation |
|----|--------|------------|------------|
| R-01 | **Token läuft nie ab** | Security-Risk, kompromittierte Tokens bleiben gültig | Token-Expiry + Refresh implementieren |
| R-02 | **Keine Rate-Limiting** | API-Abuse möglich | Express-Rate-Limit Middleware |
| R-03 | **Unzureichende Tests** | Regressions bei Changes | 60+ Tests für kritische Flows |
| R-04 | **Base64 Audio in DB** | Performance-Problem bei großen Dateien | Migration zu S3/Cloudinary |

### Mittlere Risiken

| ID | Risiko | Auswirkung | Mitigation |
|----|--------|------------|------------|
| R-05 | **Mistral API Limits** | User kann API-Limit erreichen | Cost-Estimation-Feature |
| R-06 | **Replit DB Limits** | Speicher-Limits können erreicht werden | Archivierungs-Strategie |
| R-07 | **Keine Strukturiertes Logging** | Debugging schwierig | Winston/Pino implementieren |

## 11.2 Technische Schulden

### Kritische Schulden

1. **Token-Management** (Aufwand: 1-2 Tage)
   - Problem: Tokens laufen nie ab
   - Lösung: Token-Expiry + Refresh-Mechanismus
   - Priorität: HOCH

2. **Test-Coverage** (Aufwand: 2-3 Tage)
   - Problem: Keine Tests für kritische Auth/Sync-Flows
   - Lösung: 60+ zusätzliche Tests
   - Priorität: KRITISCH

3. **Error-Handling** (Aufwand: 1-2 Tage)
   - Problem: Keine exponential backoff, keine User-Notifications
   - Lösung: Retry-Strategie + Toast-Messages
   - Priorität: HOCH

### Wichtige Schulden

4. **Code-Redundanzen** (Aufwand: 2-3 Tage)
   - Problem: ~200-300 Zeilen duplizierten Code
   - Bereiche: Token-Handling (5x), 401-Error (4x), Status-Updates (8x)
   - Lösung: useAuth Hook, AuthenticatedAPIClient, RecordingManager
   - Priorität: MITTEL

5. **Audio-Storage** (Aufwand: 2-3 Tage)
   - Problem: Base64 in Replit DB ineffizient
   - Lösung: Cloud-Storage (S3/Cloudinary)
   - Priorität: MITTEL

6. **Monitoring** (Aufwand: 1-2 Tage)
   - Problem: Nur console.log, keine Metriken
   - Lösung: Winston/Pino + Sentry
   - Priorität: MITTEL

### Nice-to-Have

7. **WebSocket statt Polling** (Aufwand: 12-16h)
8. **Audio-Komprimierung** (Aufwand: 1-2 Tage)
9. **GitHub-Service-Extraktion** (Aufwand: ✅ Bereits implementiert!)

## 11.3 Verbesserungsempfehlungen

### Sofort (Pre-Production)

1. ✅ **Environment-Variable-Validation** (Erledigt)
2. ✅ **Health-Check-Endpoint** (Erledigt)
3. ✅ **Graceful Shutdown** (Erledigt)
4. ✅ **Error Boundary** (Erledigt)
5. ❌ **Token-Expiry** (MUSS)
6. ❌ **Rate-Limiting** (MUSS)
7. ❌ **File-Validation** (MUSS)
8. ❌ **Test-Suite erweitern** (MUSS)

### Kurzfristig (1-2 Monate)

1. **Code-Refactoring:**
   - useAuth Hook für zentrales Auth-State-Management
   - AuthenticatedAPIClient mit automatischem Token-Handling
   - RecordingManager für Upload-Logik
   - Reduziert Redundanz um ~40%

2. **Monitoring & Observability:**
   - Strukturiertes Logging (Winston/Pino)
   - Error-Tracking (Sentry)
   - Performance-Metriken
   - Health-Dashboard

3. **Performance:**
   - Audio-Komprimierung vor Upload
   - Progressive Upload mit Chunks
   - IndexedDB Cleanup-Strategy

### Mittelfristig (3-6 Monate)

1. **WebSocket-Integration:** Echtzeit-Updates statt Polling
2. **Cloud-Storage-Migration:** S3/Cloudinary für Audio
3. **Analytics-Dashboard:** Usage-Metriken, API-Kosten
4. **Multi-Language-Support:** i18n für UI

## 11.4 Redundanzen im Code

### Identifizierte Duplikationen

1. **Token-Abfrage** (5x ~50 Zeilen)
   ```typescript
   const token = localStorage.getItem('auth_token');
   if (!token) { setShowLoginPrompt(true); }
   ```
   **Vorkommen:** uploadRecording, syncPending, monitorTranscription, checkAuth

2. **401-Error-Handling** (4x ~40 Zeilen)
   ```typescript
   if (response.status === 401) {
     localStorage.removeItem('auth_token');
     setIsAuthenticated(false);
   }
   ```

3. **Status-Updates** (8x ~80 Zeilen)
   ```typescript
   await indexedDB.updateRecording(localId, { status: 'xyz' });
   ```

4. **Bearer Token Headers** (6x ~30 Zeilen)
   ```typescript
   headers: { Authorization: `Bearer ${token}` }
   ```

**Reduktionspotenzial:** ~200-300 Zeilen durch Abstraktion

### Empfohlene Refactorings

```typescript
// 1. Zentraler Auth-Hook
function useAuth() {
  // Zentrale Verwaltung von Token + isAuthenticated
  // Event-Listener für auth-failed
  return { token, isAuthenticated, login, logout };
}

// 2. API-Client
class AuthenticatedAPIClient {
  async request(url, options) {
    // Automatisches Token-Handling
    // Automatisches 401-Error-Handling
  }
}

// 3. Recording Manager
class RecordingManager {
  async uploadRecording(localId, audioBlob, duration) {
    // Zentrale Upload-Logik
    // Konsistentes Error-Handling
  }
}
```

---

# 12. Glossar

| Begriff | Definition |
|---------|------------|
| **arc42** | Template für Softwarearchitektur-Dokumentation |
| **BYOK** | Bring Your Own Key - User bringt eigenen API-Key |
| **IndexedDB** | Browser-Datenbank für clientseitige Speicherung |
| **Job Queue** | System für asynchrone Job-Verarbeitung |
| **LED-Display** | 16x16 LED-Matrix für Frequenz-Visualisierung |
| **Mistral Voxtral** | Speech-to-Text Modell von Mistral AI |
| **Mistral Large** | Chat-Completion Modell für Zusammenfassungen |
| **OAuth2** | Authentifizierungs-Standard (via GitHub) |
| **PWA** | Progressive Web App - installierbare Web-App |
| **Rabbit R1** | Hardware-Gerät mit 240x282px Display |
| **Replit Database** | Key-Value-Store von Replit Platform |
| **Service Worker** | Browser-Feature für Offline-Caching |
| **sideClick** | Hardware-Button am Rabbit R1 |
| **TranscriptionWorker** | Background-Worker für asynchrone Verarbeitung |

---

# Anhang A: API-Übersicht

## Authentifizierung

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/api/auth/github` | GET | Nein | OAuth-Flow starten |
| `/api/auth/github/callback` | GET | Nein | OAuth-Callback |
| `/api/auth/user` | GET | Ja | User-Daten abrufen |
| `/api/auth/logout` | POST | Nein | Logout (client-seitig) |

## Recordings

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/api/recordings` | GET | Ja | Alle Recordings |
| `/api/recordings` | POST | Ja | Neue Aufnahme hochladen |
| `/api/recordings/:id` | DELETE | Ja | Recording löschen |
| `/api/recordings/:id/transcribe` | POST | Ja | Transkription neu anstoßen |

## Settings

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/api/settings` | GET | Ja | Settings abrufen |
| `/api/settings` | PATCH | Ja | Settings aktualisieren |

## GitHub

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/api/github/repos` | GET | Ja | Repositories listen |

## Health

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/health` | GET | Nein | Health-Status |

---

# Anhang B: Datenmodell

## User

```typescript
interface User {
  id: string;              // GitHub User ID
  username: string;        // GitHub Username
  accessToken: string;     // GitHub OAuth Token
  createdAt: Date;
}
```

## Recording

```typescript
interface Recording {
  id: string;
  userId: string;
  audioData: string;       // Base64-encoded audio
  duration: number;        // Seconds
  transcript?: string;
  summary?: string;
  title?: string;
  status: 'pending' | 'transcribing' | 'transcribed' | 'failed';
  githubFileUrl?: string;
  createdAt: Date;
  transcribedAt?: Date;
}
```

## LocalRecording (Client)

```typescript
interface LocalRecording {
  id: string;              // UUID
  audioBlob: Blob;
  duration: number;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  createdAt: Date;
  serverRecordingId?: string;
}
```

## Settings

```typescript
interface Settings {
  userId: string;
  mistralApiKey?: string;
  githubRepoOwner?: string;
  githubRepoName?: string;
  summaryTemplate?: string;
}
```

---

# Anhang C: Deployment-Checklist

## Pre-Deployment

- [ ] Environment Variables gesetzt
- [ ] GitHub OAuth App konfiguriert
- [ ] Build erfolgreich (`npm run build`)
- [ ] Tests passing (`npm test`)
- [ ] TypeScript-Check OK (`npm run check`)

## Deployment

- [ ] Code nach Replit pushed
- [ ] Secrets in Replit konfiguriert
- [ ] Production-Build erstellt
- [ ] Server startet ohne Errors
- [ ] Health-Check antwortet
- [ ] Service Worker registriert
- [ ] HTTPS aktiv

## Post-Deployment

- [ ] OAuth-Flow testen
- [ ] Audio-Aufnahme testen
- [ ] Transkription testen
- [ ] GitHub-Export testen
- [ ] Offline-Modus testen
- [ ] PWA-Installation testen

---

**Dokumentation erstellt:** 18. November 2025  
**Letzte Aktualisierung:** 18. November 2025  
**Version:** 1.0  
**Status:** ✅ Vollständig konsolidiert

**Mitwirkende:**
- Architekturanalyse: GitHub Copilot
- Quellen: Alle existierenden Dokumentationen + Codeanalyse
- Template: arc42 Version 8.0
