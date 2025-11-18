# 🎙️ RabbitMistralScribe

Eine Progressive Web App (PWA) für Audio-Notizen mit automatischer Transkription und Zusammenfassung, optimiert für das Rabbit R1 Gerät (240x282px Display).

## ✨ Features

### Kernfunktionen
- 🎤 **Audio-Aufnahme** mit Echtzeit-LED-Frequenz-Visualisierung
- 📝 **Automatische Transkription** via Mistral Voxtral API
- 📊 **KI-Zusammenfassung** und automatische Titelerstellung
- 🐙 **GitHub-Integration** für Markdown-Export
- 📱 **Offline-Support** mit IndexedDB-Speicherung
- 🔄 **Automatische Synchronisation** bei Netzwerkverbindung
- 🔐 **GitHub OAuth** Authentifizierung
- 🎨 **Responsive Design** für Rabbit R1 (240x282px)

### Technische Highlights
- ⚡ Push-basiertes Job-Queue-System (kein Polling)
- 🔧 Service Worker für PWA-Funktionalität
- 🎯 Bring Your Own Key (BYOK) für Mistral API
- 🛡️ Umfassende Error-Handling mit Error Boundaries
- 📊 Health-Check-Endpoint für Monitoring
- 🔄 Graceful Shutdown für Production

## 🚀 Quick Start

### Voraussetzungen
- Node.js 20.x oder höher
- npm oder yarn
- GitHub OAuth App (für Authentifizierung)
- Mistral API Key (für Transkription und Zusammenfassung)

### Installation

1. **Repository klonen**
   ```bash
   git clone https://github.com/merlinbecker/rabbitMistralScribe.git
   cd rabbitMistralScribe
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Environment Variables konfigurieren**
   
   Kopiere die `.env.example` Datei zu `.env` und fülle die Werte aus:
   ```bash
   cp .env.example .env
   ```

   Erforderliche Variablen:
   ```env
   # GitHub OAuth (erforderlich für Authentifizierung)
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   
   # Session Secret (mindestens 32 Zeichen)
   SESSION_SECRET=your_random_32_char_or_longer_secret
   
   # Mistral API Configuration (optional, haben Defaults)
   MISTRAL_STT_MODEL=voxtral-24.02
   MISTRAL_SUMMARIZER_MODEL=mistral-large-latest
   ```

4. **GitHub OAuth App erstellen**
   
   - Gehe zu [GitHub Developer Settings](https://github.com/settings/developers)
   - Erstelle eine neue OAuth App
   - Setze die Authorization callback URL:
     - Development: `http://localhost:5000/api/auth/github/callback`
     - Production: `https://your-domain.com/api/auth/github/callback`
   - Kopiere Client ID und Client Secret in deine `.env` Datei

5. **Development Server starten**
   ```bash
   npm run dev
   ```
   
   Die App ist nun verfügbar unter `http://localhost:5000`

### Production Build

```bash
# Build erstellen
npm run build

# Production Server starten
npm start
```

## 🎯 Verwendung

### Erste Schritte

1. **Anmelden** mit GitHub OAuth (wird automatisch gefordert, wenn Sie nicht angemeldet sind)
2. **Settings konfigurieren** (über Settings-Button in der Status-Leiste):
   - Mistral API Key hinzufügen (BYOK) - wird automatisch angezeigt, wenn nicht konfiguriert
   - GitHub Repository für Markdown-Export konfigurieren (optional)
   - Zusammenfassungs-Template anpassen (optional)

### Audio-Notiz erstellen

1. **Aufnahme starten**:
   - Auf Rabbit R1: `sideClick` Button drücken
   - Im Browser: Aufnahme-Button klicken oder `Ctrl+S` (Development)
   
2. **Sprechen**: Die LED-Anzeige visualisiert die Audio-Frequenzen in Echtzeit

3. **Aufnahme beenden**: Erneut Button drücken oder `Ctrl+S`

4. **Automatische Verarbeitung**:
   - Audio wird in IndexedDB gespeichert (Offline-Support)
   - Bei Internetverbindung wird Upload gestartet
   - Transkription beginnt automatisch
   - Zusammenfassung und Titel werden generiert
   - Optional: Markdown-Datei wird in GitHub-Repo gespeichert

### Offline-Modus

- Aufnahmen werden lokal in IndexedDB gespeichert
- Bei erneuter Verbindung erfolgt automatische Synchronisation
- Service Worker cached die App für vollständige Offline-Nutzung

## 🏗️ Architektur

### Frontend (React + Vite)
- **React 18** mit TypeScript
- **TanStack Query** für Server-State-Management
- **IndexedDB** für lokale Audio-Speicherung
- **Wouter** für Routing
- **Tailwind CSS** + Radix UI für Design
- **Service Worker** für PWA-Funktionalität

### Backend (Express + TypeScript)
- **Express.js** Server mit TypeScript
- **Replit Database** als Key-Value-Store
- **Job Queue System** für asynchrone Verarbeitung
- **GitHub OAuth** über PassportJS
- **Mistral AI** Integration (Voxtral + Large)

### Services
- `AuthenticationService`: OAuth und Session-Management
- `DatabaseService`: Zentrale Abstraktion für Replit DB
- `MistralService`: Transkription und Zusammenfassung
- `GitHubService`: GitHub-Repository-Operationen (Refactored)
- `TranscriptionWorker`: Background-Worker für Job-Processing
- `JobQueue`: Push-basiertes Queue-System

## 🧪 Testing

```bash
# Alle Tests ausführen
npm test

# Tests mit Coverage
npm run test:coverage

# Tests im UI-Modus
npm run test:ui
```

**Test-Coverage**: 122+ Unit-Tests für alle kritischen Services

## 📊 API Endpoints

### Authentication
- `GET /api/auth/github` - GitHub OAuth initiieren
- `GET /api/auth/github/callback` - OAuth Callback
- `GET /api/auth/user` - Aktuellen User abrufen
- `GET /api/auth/token` - Bearer Token generieren
- `POST /api/auth/logout` - Logout

### Recordings
- `GET /api/recordings` - Alle Recordings abrufen
- `POST /api/recordings` - Neue Aufnahme hochladen
- `DELETE /api/recordings/:id` - Recording löschen

### Settings
- `GET /api/settings` - User-Settings abrufen
- `PATCH /api/settings` - Settings aktualisieren

### Health Check
- `GET /health` - Health Status (für Monitoring)

## 🔧 Environment Variables

| Variable | Erforderlich | Default | Beschreibung |
|----------|--------------|---------|--------------|
| `NODE_ENV` | Nein | `development` | Umgebung (development/production/test) |
| `PORT` | Nein | `5000` | Server Port |
| `SESSION_SECRET` | **Ja** | - | Session Secret (min. 32 Zeichen) |
| `GITHUB_CLIENT_ID` | **Ja** | - | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | **Ja** | - | GitHub OAuth Client Secret |
| `MISTRAL_STT_MODEL` | Nein | `voxtral-24.02` | Mistral STT Model |
| `MISTRAL_SUMMARIZER_MODEL` | Nein | `mistral-large-latest` | Mistral Summarizer Model |
| `REPL_HOME` | Nein | - | Replit URL (für Production) |

## 🚀 Deployment

### Replit Deployment

1. **Replit Secrets konfigurieren**:
   - Füge alle Environment Variables als Secrets hinzu
   
2. **Build ausführen**:
   ```bash
   npm run build
   ```

3. **Server starten**:
   ```bash
   npm start
   ```

4. **Custom Domain** (optional):
   - Konfiguriere Custom Domain in Replit Settings
   - Update GitHub OAuth Callback URL

### Health Check

Der Server bietet einen `/health` Endpoint für Monitoring:

```bash
curl https://your-domain.com/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T18:00:00.000Z",
  "services": {
    "database": "up",
    "worker": "up"
  },
  "environment": "production"
}
```

## 📝 Scripts

```bash
npm run dev          # Development Server (mit Hot-Reload)
npm run build        # Production Build
npm start            # Production Server
npm test             # Tests ausführen
npm run test:ui      # Tests im UI-Modus
npm run test:coverage # Tests mit Coverage
npm run check        # TypeScript Check
```

## 🤝 Contributing

Contributions sind willkommen! Bitte erstelle einen Pull Request oder öffne ein Issue.

### Development Guidelines
- Folge dem existierenden Code-Style
- Füge Tests für neue Features hinzu
- Aktualisiere Dokumentation bei API-Änderungen
- Nutze TypeScript für Type-Safety

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei für Details.

## 🙏 Acknowledgments

- **Mistral AI** für Transkription und Zusammenfassung
- **Rabbit R1** für das innovative Hardware-Design
- **Replit** für Hosting und Database

## 📞 Support

Bei Fragen oder Problemen:
- Öffne ein [GitHub Issue](https://github.com/merlinbecker/rabbitMistralScribe/issues)
- Siehe [Troubleshooting Guide](docs/TROUBLESHOOTING.md)

---

Made with ❤️ for Rabbit R1
