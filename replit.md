# Audio Notes PWA - Rabbit R1

Eine Progressive Web App zum Aufnehmen, Transkribieren und automatischen Zusammenfassen von Audio-Notizen, optimiert für den Rabbit R1 (240x282 Pixel).

## Funktionen

- **Audio-Aufnahme**: Start/Stopp über Seitentaste ("sideClick"-Event) oder Button
- **16x16 LED-Visualisierung**: Echtzeit-Frequenzanalyse mit Farben (rot/gelb/orange)
- **Offline-fähig**: Lokale Speicherung in IndexedDB bis zur Synchronisierung
- **Transkription**: Mistral Voxtral API für Speech-to-Text
- **Zusammenfassung**: Mistral Agent für strukturierte Markdown-Zusammenfassungen
- **GitHub-Integration**: Speicherung als Markdown-Dateien im ausgewählten Repository
- **BYOK**: Bring Your Own Key - jeder Nutzer kann seinen eigenen Mistral API-Schlüssel hinterlegen

## Architektur

### Frontend
- **React** mit Wouter für Routing
- **Tailwind CSS** für Rabbit R1-optimiertes Design (240x282px)
- **TanStack Query** für State Management
- **IndexedDB** für Offline-Speicherung
- **Web Audio API** für Aufnahme und Frequenzanalyse

### Backend
- **Express.js** Server
- **In-Memory Storage** (MemStorage) für Entwicklung
- **GitHub OAuth** für Authentifizierung
- **Mistral API** Integration
- **GitHub API** für Repository-Zugriff

### Datenmodelle

#### Users
- GitHub-basierte Authentifizierung
- Access Token für GitHub API-Zugriff

#### User Settings
- Mistral API Key (BYOK)
- Ausgewähltes GitHub Repository

#### Recordings
- Audio-Daten (als Base64)
- Status: pending, transcribing, transcribed, failed
- Transkript und Zusammenfassung
- Link zur GitHub-Datei

## Setup

### 1. GitHub OAuth App erstellen

1. Gehe zu https://github.com/settings/developers
2. Erstelle eine neue OAuth App
3. Authorization callback URL: `https://your-repl-url.replit.dev/api/auth/github/callback`
4. Kopiere Client ID und Client Secret

### 2. Umgebungsvariablen

Die folgenden Secrets müssen in Replit konfiguriert werden:

- `GITHUB_CLIENT_ID`: GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth App Client Secret
- `SESSION_SECRET`: Wird automatisch generiert

### 3. Mistral API Key

Jeder Nutzer muss seinen eigenen Mistral API Key in den App-Einstellungen hinterlegen:

1. API Key erstellen auf https://console.mistral.ai/
2. In der App unter "Einstellungen" eintragen
3. GitHub Repository auswählen

## Entwicklung

```bash
npm install
npm run dev
```

Die App läuft auf Port 5000 und ist unter der Replit-URL erreichbar.

## API Endpoints

### Authentication
- `GET /api/auth/github` - Start GitHub OAuth flow
- `GET /api/auth/github/callback` - OAuth callback
- `GET /api/auth/user` - Get current user
- `POST /api/auth/logout` - Logout

### Settings
- `GET /api/settings` - Get user settings
- `PATCH /api/settings` - Update settings (Mistral key, GitHub repo)

### GitHub
- `GET /api/github/repos` - List user's repositories

### Recordings
- `GET /api/recordings` - List user's recordings
- `POST /api/recordings` - Upload audio recording
- `POST /api/recordings/:id/transcribe` - Transcribe and summarize

## Design-System

Das Design folgt den Richtlinien in `design_guidelines.md`:

- **Minimalistisch**: Fokus auf Funktionalität
- **Touch-optimiert**: 48px Buttons, 240px Breite
- **LED-Visualisierung**: Hauptvisuelles Element
- **System Fonts**: Keine Custom Fonts
- **Spacing**: 2, 3, 4, 6 (Tailwind units)

## PWA Features

- Service Worker für Offline-Funktionalität
- App Manifest für Installation
- IndexedDB für lokale Datenpersistenz
- Automatische Synchronisierung bei Verbindung

## Technische Besonderheiten

### Rabbit R1 Optimierung

- Viewport: 240x282 Pixel
- sideClick-Event für Hardware-Button
- Single-Column Layout
- Große Touch-Targets (min. 44x44px)

### Offline-First

1. Aufnahme wird lokal in IndexedDB gespeichert
2. Bei Verbindung wird hochgeladen und transkribiert
3. Ergebnis wird in GitHub gespeichert
4. Lokale Kopie wird gelöscht

### Sicherheit

- GitHub OAuth für sichere Authentifizierung
- API Keys werden verschlüsselt in der Datenbank gespeichert
- Session-basierte Authentifizierung
- HTTPS in Produktion
