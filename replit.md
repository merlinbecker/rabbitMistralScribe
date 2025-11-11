# Audio Notes PWA - Rabbit R1

Eine Progressive Web App zum Aufnehmen, Transkribieren und automatischen Zusammenfassen von Audio-Notizen, optimiert für den Rabbit R1 (240x282 Pixel).

## Funktionen

- **Audio-Aufnahme**: Start/Stopp über Seitentaste ("sideClick"-Event) oder Button
- **16x16 LED-Visualisierung**: Echtzeit-Frequenzanalyse mit Farben (rot/gelb/orange)
- **Audio-Wiedergabe**: Play/Pause-Steuerung mit Fortschrittsbalken und Zeitanzeige
- **Suche & Filter**: Volltextsuche in Transkripten/Zusammenfassungen, Status-Filter
- **Notizen bearbeiten**: Transkripte und Zusammenfassungen vor GitHub-Commit bearbeiten
- **Batch-Verarbeitung**: "Transkribiere Alle" für mehrere ausstehende Aufnahmen
- **Offline-fähig**: Lokale Speicherung in IndexedDB bis zur Synchronisierung
- **Transkription**: Mistral Voxtral API für Speech-to-Text
- **Zusammenfassung**: Mistral Agent mit anpassbaren Templates
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
- Custom Summary Template (mit Platzhaltern: {{transcript}}, {{timestamp}}, {{duration}})

#### Recordings
- Audio-Daten (als Base64)
- Status: pending, transcribing, transcribed, failed
- KI-generierter Titel (einzeilig, max. 60 Zeichen)
- Transkript (vollständige Spracherkennung)
- Zusammenfassung (strukturierte KI-Zusammenfassung)
- Link zur GitHub-Datei (Markdown mit YAML Frontmatter)

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
- `POST /api/recordings` - Upload audio recording (FormData: audio, duration)
- `POST /api/recordings/:id/transcribe` - Manually trigger transcription
- `PATCH /api/recordings/:id` - Update title/transcript/summary

## Design-System

Das Design folgt den Richtlinien in `design_guidelines.md`:

- **Minimalistisch**: Fokus auf Funktionalität
- **Touch-optimiert**: 48px Buttons, 240px Breite
- **LED-Visualisierung**: Hauptvisuelles Element
- **System Fonts**: Keine Custom Fonts
- **Spacing**: 2, 3, 4, 6 (Tailwind units)

## PWA Features

- Service Worker für Offline-Funktionalität (registriert mit korrektem MIME Type)
- Precaching von Core Assets (/, /manifest.json)
- Offline-Navigation Fallback auf cached index.html
- App Manifest für Installation auf Rabbit R1
- IndexedDB für lokale Datenpersistenz
- Runtime Caching für statische Assets

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

## Implementierte Features (Status: ✅ Abgeschlossen)

### 1. Service Worker & PWA
- Korrekte Registrierung über dedizierte Express-Route mit MIME Type "application/javascript"
- Precaching von Shell-Assets (/, /manifest.json)
- Network-first mit Cache-Fallback für alle statischen Ressourcen
- Offline-Navigation: Fallback auf cached index.html
- Cache-Versionierung und automatisches Cleanup alter Caches

### 2. Audio-Wiedergabe
- Play/Pause-Toggle für jede Aufnahme
- Echtzeit-Fortschrittsbalken während der Wiedergabe
- Zeitanzeige: Aktuelle Position / Gesamtdauer (Format: mm:ss)
- Konsistente Zeiteinheit: Durchgehend Sekunden (Frontend Timer, Backend Storage, UI Display)
- Automatisches Reset bei Ende der Wiedergabe
- Alle interaktiven Elemente mit data-testid Attributen

### 3. Suche & Filter
- Volltextsuche in transcript und summary Feldern
- Status-Dropdown Filter: Alle, Ausstehend, In Verarbeitung, Transkribiert, Fehler
- Client-seitige Filterung mit useMemo für Performance
- Clear-Button zum Zurücksetzen der Suche
- Effiziente Kombination von Suche + Status-Filter

### 4. Custom Summary Templates
- Anpassbare Template-Eingabe in Settings mit Textarea
- Platzhalter-System: {{transcript}}, {{timestamp}}, {{duration}}
- Pre-filling existierender Templates beim Laden (useEffect)
- Intelligentes Speichern: Nur geänderte Felder werden gesendet
- Backend-Integration: Custom Template wird in Mistral System Prompt verwendet
- Fallback auf Standard-Template bei leerem Custom Template

### 5. Notizen bearbeiten
- Edit-Button für jede transkribierte Aufnahme
- Dialog mit separaten Textareas für Transcript und Summary
- Optimierte Größe für Rabbit R1 (max-w-[220px])
- PATCH-Request an `/api/recordings/:id` Endpoint
- Query Cache Invalidierung nach erfolgreicher Bearbeitung
- Toast-Benachrichtigungen für Erfolg und Fehler
- Bearbeitung ohne Beeinträchtigung der Wiedergabe-Funktionalität

### 6. Batch-Verarbeitung
- "Transkribiere Alle (N)"-Button erscheint nur bei pending Aufnahmen
- Sequenzielle Verarbeitung aller pending Recordings
- POST zu `/api/recordings/:id/transcribe` für jede Aufnahme
- Aggregation von Success/Failure Counts
- Final-Toast mit Gesamtergebnis (X erfolgreich, Y fehlgeschlagen)
- Loading-State mit Spinner während Verarbeitung
- Automatische Query Cache Invalidierung nach Abschluss

### 7. Recording Workflow (Vollständig)
- **Aufnahme**: Client erstellt Audio-Aufnahme und speichert in IndexedDB
- **Upload**: Bei Online-Verbindung automatischer Upload zum Server
- **Transkription**: Mistral Voxtral API konvertiert Audio zu Text
- **Titel-Generierung**: Mistral Chat API erstellt einzeiligen Titel (max. 60 Zeichen)
- **Zusammenfassung**: Mistral Chat API erstellt strukturierte Zusammenfassung
- **GitHub-Export**: Markdown-Datei mit YAML Frontmatter (title, date, duration, summary)
- **Status-Updates**: Client pollt alle 3 Sekunden und aktualisiert UI
- **Cleanup**: Nach erfolgreicher Transkription wird Audio aus IndexedDB gelöscht

## Technische Details

### Duration Handling
- **Frontend Timer**: Inkrementiert jede Sekunde (recordingTime++)
- **Backend Storage**: Speichert duration als Integer (Sekunden)
- **Audio Element**: Verwendet currentTime in Sekunden (Web Audio API Standard)
- **UI Display**: formatDuration(seconds) → "mm:ss" Format
- **Konsistenz**: Keine Konvertierung nötig, alles in Sekunden

### State Management
- TanStack Query v5 für Server State
- React useState für lokale UI State (Edit-Dialog, Wiedergabe, Filter)
- useMemo für abgeleitete States (filteredRecordings)
- Query Cache Invalidierung nach Mutations für Datenkonsistenz

### Error Handling
- Try-catch in allen async Operationen
- Toast-Benachrichtigungen für User Feedback
- Mutation onError Callbacks mit spezifischen Fehlermeldungen
- Retry-Logic in Queries (retry: 2)

### Optimierungen
- Effiziente Client-seitige Filterung mit useMemo
- Conditional Rendering (z.B. "Alle (N)" Button nur bei pending > 0)
- Loading States für alle async Operationen
- Optimistische UI Updates durch Query Invalidierung
