# GitHubService

## Übersicht

Der `GitHubService` ist ein zentralisierter Service, der alle GitHub-Repository-bezogenen Operationen kapselt. Er wurde im Rahmen eines Refactorings extrahiert, um Code-Duplikation zu eliminieren und das Dependency Injection Pattern zu implementieren.

## Architektur

### Dependency Injection

Der `GitHubService` folgt dem Dependency Injection Pattern:

```typescript
const githubService = new GitHubService(storage);
```

**Vorteile:**
- Verbesserte Testbarkeit durch Mock-Injection
- Klare Abhängigkeiten
- Lose Kopplung zwischen Komponenten
- Einfache Wartung und Erweiterung

### Interface-Definition

```typescript
interface IGitHubService {
  fetchRepositories(userId: string): Promise<GitHubRepository[]>;
  saveRecordingToGitHub(params: SaveToGitHubParams): Promise<SaveToGitHubResult>;
}
```

## API

### fetchRepositories(userId: string)

Lädt die GitHub-Repositories eines Benutzers.

**Parameter:**
- `userId` (string): Die User-ID des Benutzers

**Rückgabe:**
- `Promise<GitHubRepository[]>`: Array von Repository-Objekten

**Fehler:**
- Wirft einen Fehler, wenn der Benutzer nicht gefunden wird
- Wirft einen Fehler, wenn kein Access Token vorhanden ist
- Wirft einen Fehler, wenn die GitHub API den Request ablehnt

**Beispiel:**
```typescript
const repos = await githubService.fetchRepositories('user-123');
```

### saveRecordingToGitHub(params: SaveToGitHubParams)

Speichert eine Aufnahme als Markdown-Datei in einem GitHub-Repository.

**Parameter:**
```typescript
interface SaveToGitHubParams {
  recordingId: string;
  userId: string;
}
```

**Rückgabe:**
```typescript
interface SaveToGitHubResult {
  githubFileUrl: string;  // URL der erstellten Datei
  filename: string;        // Dateiname der erstellten Datei
}
```

**Fehler:**
- Wirft einen Fehler, wenn erforderliche Daten fehlen (Recording, User, Settings, Access Token)
- Wirft einen Fehler, wenn GitHub-Repository nicht konfiguriert ist
- Wirft einen Fehler, wenn die GitHub API die Dateierstellung ablehnt

**Markdown-Format:**

Die erstellte Markdown-Datei enthält:
- YAML-Frontmatter mit Metadaten (Titel, Datum, Dauer, Zusammenfassung)
- Titel als H1-Überschrift
- Transkript unter H2-Überschrift "Transkript"
- Footer mit Aufnahmedauer und Erstellungsdatum

**Beispiel:**
```typescript
const result = await githubService.saveRecordingToGitHub({
  recordingId: 'rec-123',
  userId: 'user-456'
});
console.log(result.githubFileUrl);  // https://github.com/owner/repo/blob/main/audio-notes/...
```

## Verwendung

### In Routes (server/routes.ts)

```typescript
// Dependency Injection beim Start
const githubService = new GitHubService(storage);

// Verwendung in Endpoints
app.get('/api/github/repos', requireAuth, async (req, res) => {
  try {
    const repos = await githubService.fetchRepositories(req.session.userId!);
    res.json(repos);
  } catch (error) {
    console.error('Failed to fetch GitHub repos:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});
```

### In TranscriptionWorker (server/transcriptionWorker.ts)

```typescript
// Dependency Injection im Constructor
constructor(
  jobQueue: JobQueue, 
  storage: IStorage, 
  mistralService: IMistralService,
  githubService: IGitHubService  // Injiziert
) {
  this.githubService = githubService;
}

// Verwendung
if (settings.githubRepoOwner && settings.githubRepoName) {
  await this.githubService.saveRecordingToGitHub({ recordingId, userId });
}
```

## Tests

Der `GitHubService` verfügt über eine umfassende Test-Suite mit 16 Tests in `tests/githubService.test.ts`:

### Test-Kategorien

1. **Repository Fetching:**
   - Erfolgreicher Abruf von Repositories
   - Fehlerbehandlung bei fehlendem User/Token
   - Fehlerbehandlung bei GitHub API-Fehlern

2. **Recording zu GitHub speichern:**
   - Erfolgreiche Speicherung
   - Korrekte Markdown-Generierung
   - Formatierung von Dauer und Zeitstempel
   - Fehlerbehandlung bei fehlenden Daten
   - Fehlerbehandlung bei nicht konfiguriertem Repository
   - Fehlerbehandlung bei GitHub API-Fehlern
   - Edge Cases (fehlende Timestamps, mehrzeilige Zusammenfassungen)

3. **Constructor:**
   - Custom GitHub API Base URL
   - Default GitHub API Base URL

### Test-Ausführung

```bash
npm run test:run
```

Alle Tests verwenden Mocks für:
- Storage-Layer (IStorage)
- GitHub API (fetch)

## Konfiguration

### Environment Variables

Keine direkten Environment Variables erforderlich. Die GitHub-Integration verwendet:

- Access Tokens aus User-Objekten (aus OAuth-Flow)
- Repository-Konfiguration aus User-Settings

### GitHub API Endpoint

Standard: `https://api.github.com`

Kann über Constructor-Parameter angepasst werden:
```typescript
const githubService = new GitHubService(storage, 'https://custom.github.com');
```

## Fehlerbehebung

### "GitHub access token not found"

**Ursache:** User hat kein gültiges Access Token oder ist nicht authentifiziert.

**Lösung:** Benutzer muss sich erneut über GitHub OAuth anmelden.

### "GitHub repository not configured"

**Ursache:** User hat kein GitHub-Repository in den Settings konfiguriert.

**Lösung:** Benutzer muss in den Einstellungen ein Repository auswählen.

### "GitHub file creation failed"

**Ursache:** GitHub API lehnt die Dateierstellung ab (Berechtigungen, Repository existiert nicht, etc.).

**Lösung:**
- Überprüfen, ob das Repository existiert
- Überprüfen, ob der Access Token noch gültig ist
- Überprüfen, ob der User Schreibrechte auf das Repository hat

## Migration von altem Code

### Vorher (Duplikat in routes.ts und transcriptionWorker.ts)

```typescript
// Duplizierte Funktion mit 60+ Zeilen
async function saveToGitHub(recordingId: string, userId: string) {
  const recording = await storage.getRecording(recordingId);
  // ... 60+ Zeilen Code ...
  await storage.updateRecording(recordingId, {
    githubFileUrl: fileData.content.html_url,
  });
}
```

### Nachher (Zentralisierter Service)

```typescript
// Einfacher Aufruf
await githubService.saveRecordingToGitHub({ recordingId, userId });
```

**Vorteile:**
- ~128 Zeilen duplizierten Code eliminiert
- Bessere Testbarkeit (16 dedizierte Tests)
- Klare Verantwortlichkeiten
- Einfachere Wartung
- Type-Safety durch TypeScript-Interfaces

## Siehe auch

- [AuthenticationService](./AuthenticationService.md) - OAuth und Authentifizierung
- [MistralService](./mistralService.md) - KI-Transkription und Zusammenfassung
- [DatabaseService](./DatabaseService.md) - Datenbank-Operationen
