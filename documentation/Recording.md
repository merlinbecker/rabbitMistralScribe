# Recording Workflow

Dieses Dokument beschreibt den vollständigen Ablauf der Audio-Aufnahme-Verarbeitung von der Aufnahme bis zur Speicherung in GitHub.

## Übersicht

Die Anwendung ermöglicht es Benutzern, Audio-Notizen aufzunehmen, die automatisch transkribiert, zusammengefasst und in einem GitHub-Repository gespeichert werden. Der Workflow ist für Offline-Unterstützung konzipiert und verarbeitet Aufnahmen automatisch, sobald eine Internetverbindung besteht.

## Workflow-Schritte

### 1. Aufnahme starten

**Client-Seite (`client/src/pages/home.tsx`)**

- Der Benutzer startet eine Aufnahme durch Drücken der Aufnahme-Taste oder der Seitentaste (für Rabbit R1)
- Die `startRecording()` Funktion:
  - Fordert Mikrofonzugriff an
  - Erstellt einen `MediaRecorder` mit WebM/Opus Codec
  - Startet einen Timer zur Aufzeichnung der Dauer
  - Visualisiert die Aufnahme in Echtzeit über das LED-Display

```typescript
const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } 
  });
  
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus'
  });
  
  mediaRecorder.start(100); // Daten alle 100ms sammeln
}
```

### 2. Aufnahme beenden und lokales Speichern

**Client-Seite**

- Der Benutzer stoppt die Aufnahme
- Die `onstop` Event-Handler wird ausgelöst:
  - Audio-Chunks werden zu einem Blob zusammengefügt
  - `saveRecordingLocally()` wird aufgerufen

```typescript
mediaRecorder.onstop = async () => {
  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
  await saveRecordingLocally(audioBlob, recordingTime);
}
```

**Lokale Speicherung in IndexedDB**

- Die Aufnahme wird in IndexedDB mit Status `'queued'` gespeichert
- Dies ermöglicht Offline-Funktionalität
- Struktur: `{ id, audioBlob, duration, timestamp, status }`

```typescript
await indexedDB.addRecording({
  id: recordingId,
  audioBlob,
  duration,
  timestamp: Date.now(),
  status: 'queued',
});
```

### 3. Upload zum Server (bei Internetverbindung)

**Client-Seite**

- Wenn online: Sofortiger Upload über `uploadRecording()`
- Wenn offline: Verbleibt in IndexedDB bis Verbindung wiederhergestellt ist
- Status wird auf `'uploading'` gesetzt

**Upload-Prozess:**

```typescript
const formData = new FormData();
formData.append('audio', audioBlob);
formData.append('duration', duration.toString());

const response = await fetch('/api/recordings', {
  method: 'POST',
  credentials: 'include',
  body: formData,
});
```

### 4. Server-seitige Verarbeitung

**Server-Seite (`server/routes.ts`)**

**4.1 Aufnahme-Erstellung:**

```typescript
app.post('/api/recordings', requireAuth, upload.single('audio'), async (req, res) => {
  // Audio-Datei als base64 speichern
  const audioBase64 = req.file.buffer.toString('base64');
  const audioUrl = `data:${req.file.mimetype};base64,${audioBase64}`;
  
  // Aufnahme-Eintrag erstellen
  const recording = await storage.createRecording({
    userId: req.session.userId,
    audioUrl,
    duration,
    status: 'pending',
  });
  
  // Transkription im Hintergrund starten
  transcribeRecording(recording.id, userId).catch(console.error);
});
```

**4.2 Transkription (Hintergrund-Prozess):**

```typescript
async function transcribeRecording(recordingId: string, userId: string) {
  // 1. Status auf 'transcribing' setzen
  await storage.updateRecording(recordingId, { status: 'transcribing' });
  
  // 2. Transkription mit Mistral Voxtral API
  const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${mistralApiKey}` },
    body: formData,
  });
  
  const transcript = transcriptionResponse.json().text;
}
```

**4.3 Zusammenfassung erstellen:**

```typescript
// Mistral Chat API für Zusammenfassung
const summaryResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'mistral-large-latest',
    messages: [
      {
        role: 'system',
        content: 'Du bist ein Assistent, der Audio-Notizen zusammenfasst...'
      },
      {
        role: 'user',
        content: `Bitte fasse diese Notiz zusammen:\n\n${transcript}`
      }
    ],
  }),
});

const summary = summaryResponse.json().choices[0].message.content;
```

**4.4 Titel generieren:**

```typescript
// Mistral Chat API für Titel-Generierung
const titleResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: 'mistral-large-latest',
    messages: [
      {
        role: 'system',
        content: 'Du bist ein Assistent, der prägnante Titel erstellt. Erstelle einen einzeiligen Titel (maximal 60 Zeichen)...'
      },
      {
        role: 'user',
        content: `Erstelle einen kurzen Titel für diese Notiz:\n\n${transcript}`
      }
    ],
  }),
});

let title = titleResponse.json().choices[0].message.content.trim();
if (title.length > 60) {
  title = title.substring(0, 57) + '...';
}
```

**4.5 Datenbank aktualisieren:**

```typescript
await storage.updateRecording(recordingId, {
  title,
  transcript,
  summary,
  status: 'transcribed',
});
```

### 5. Speicherung in GitHub

**Server-Seite**

Wenn GitHub-Repository konfiguriert ist, wird automatisch `saveToGitHub()` aufgerufen.

**5.1 Markdown-Datei mit Frontmatter erstellen:**

```typescript
const markdownContent = `---
title: "${recording.title}"
date: ${timestamp}
duration: ${recording.duration}
summary: |
  ${recording.summary.split('\n').join('\n  ')}
---

# ${recording.title}

## Transkript

${recording.transcript}

---

*Aufnahmedauer: ${formatDuration(recording.duration)}*  
*Erstellt: ${new Date(timestamp).toLocaleString('de-DE')}*
`;
```

**5.2 Datei in GitHub-Repository hochladen:**

```typescript
const encodedContent = Buffer.from(markdownContent).toString('base64');

await fetch(
  `https://api.github.com/repos/${owner}/${repo}/contents/audio-notes/${filename}`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${userAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Audio-Notiz vom ${new Date(timestamp).toLocaleString('de-DE')}`,
      content: encodedContent,
    }),
  }
);
```

**5.3 GitHub-URL speichern:**

```typescript
await storage.updateRecording(recordingId, {
  githubFileUrl: fileData.content.html_url,
});
```

### 6. Client-Aktualisierung

**Client-Seite**

**6.1 Status-Polling:**

- Der Client pollt alle 3 Sekunden den Server
- Überprüft den Status der Aufnahme
- Maximale Polling-Dauer: 2 Minuten (40 Polls)

```typescript
const pollInterval = setInterval(async () => {
  const updatedRecordings = await fetch('/api/recordings').then(r => r.json());
  const updated = updatedRecordings.find((r: Recording) => r.id === recordingId);
  
  if (updated?.status === 'transcribed') {
    clearInterval(pollInterval);
    
    // Aus IndexedDB löschen
    await indexedDB.deleteRecording(localId);
    
    // UI aktualisieren
    queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
  }
}, 3000);
```

**6.2 UI-Aktualisierung:**

- Status-Badge wechselt von "Ausstehend" → "Verarbeitung" → "Transkribiert"
- Titel wird prominent angezeigt
- Zusammenfassung wird als Vorschau dargestellt
- Audio-Aufnahme wird aus IndexedDB gelöscht

**6.3 Anzeige in der Liste:**

```typescript
<Card>
  {recording.title && (
    <h4 className="text-body font-medium truncate">
      {recording.title}
    </h4>
  )}
  
  {recording.summary && (
    <p className="text-caption line-clamp-2">
      {recording.summary.substring(0, 120)}...
    </p>
  )}
  
  {getStatusBadge(recording.status)}
</Card>
```

## Offline-Unterstützung

### Netzwerk-Überwachung

```typescript
window.addEventListener('online', async () => {
  await syncPendingRecordings();
});

window.addEventListener('offline', () => {
  toast({ title: 'Verbindung verloren', description: 'Aufnahmen werden lokal gespeichert.' });
});
```

### Synchronisation ausstehender Aufnahmen

```typescript
const syncPendingRecordings = async () => {
  const pendingRecordings = await indexedDB.getAllRecordings();
  
  for (const pending of pendingRecordings) {
    if (pending.status === 'queued' || pending.status === 'failed') {
      await uploadRecording(pending.id, pending.audioBlob, pending.duration);
    }
  }
};
```

## Datenmodell

### Recording Schema

```typescript
export const recordings = pgTable("recordings", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  audioUrl: text("audio_url"),
  duration: integer("duration"), // in Sekunden
  status: text("status").notNull().default("pending"), // pending, transcribing, transcribed, failed
  title: text("title"), // KI-generierter Titel
  transcript: text("transcript"),
  summary: text("summary"),
  githubFileUrl: text("github_file_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Status-Zustandsmaschine

```
queued (IndexedDB)
    ↓
uploading (IndexedDB)
    ↓
pending (Server)
    ↓
transcribing (Server)
    ↓
transcribed (Server) → Datei in GitHub gespeichert
    ↓
[gelöscht aus IndexedDB]
```

## Fehlerbehandlung

### Client-seitig

- **Mikrofonzugriff fehlgeschlagen**: Toast-Benachrichtigung
- **Upload fehlgeschlagen**: Status auf 'failed' in IndexedDB, bleibt für erneuten Versuch gespeichert
- **Transkription fehlgeschlagen**: Toast-Benachrichtigung mit Hinweis auf API-Schlüssel-Prüfung

### Server-seitig

- **Fehlende Mistral API-Schlüssel**: Status auf 'failed' setzen
- **Transkriptions-Fehler**: Fehler protokollieren, Status auf 'failed' setzen
- **GitHub-Upload-Fehler**: Fehler werfen (Transkript bleibt in DB gespeichert)

## Konfiguration

### Erforderliche Umgebungsvariablen

**Server:**
- `MISTRAL_STT_MODEL` (optional): Mistral Sprachmodell, Standard: `voxtral-24.02`
- `MISTRAL_MODEL` (optional): Mistral Chat-Modell, Standard: `mistral-large-latest`

**Benutzereinstellungen:**
- `mistralApiKey`: Mistral API-Schlüssel (erforderlich für Transkription)
- `githubRepoOwner`: GitHub-Repository-Besitzer
- `githubRepoName`: GitHub-Repository-Name
- `summaryTemplate` (optional): Benutzerdefinierte Vorlage für KI-Zusammenfassung

## Leistungsüberlegungen

### API-Aufrufe

Für jede Aufnahme werden 3 Mistral API-Aufrufe durchgeführt:
1. Transkription (Voxtral STT)
2. Zusammenfassung (Chat API)
3. Titel-Generierung (Chat API)

### Speicherung

- **Audio**: Als base64 in der Datenbank (bei Produktion Cloud-Speicher empfohlen)
- **IndexedDB**: Temporäre Speicherung für Offline-Unterstützung
- **GitHub**: Permanente Markdown-Dateien im `audio-notes/` Verzeichnis

### Polling

- Intervall: 3 Sekunden
- Maximale Dauer: 2 Minuten
- Automatische Bereinigung nach erfolgreicher Transkription

## Beispiel Markdown-Ausgabe

```markdown
---
title: "Meeting-Notizen: Projekt-Planung Q1"
date: 2025-11-11T10:30:00.000Z
duration: 125
summary: |
  Besprechung der Q1-Ziele mit Fokus auf neue Features.
  Budget-Genehmigung erfolgt nächste Woche.
  Team-Erweiterung geplant für Februar.
---

# Meeting-Notizen: Projekt-Planung Q1

## Transkript

[Vollständiges Transkript der Audio-Aufnahme...]

---

*Aufnahmedauer: 2:05*  
*Erstellt: 11.11.2025, 11:30:00*
```

## Zukünftige Verbesserungen

- **Cloud-Speicher**: Integration mit S3/Cloudinary für Audio-Dateien
- **Echtzeit-Updates**: WebSockets statt Polling
- **Batch-Verarbeitung**: Effizientere Verarbeitung mehrerer Aufnahmen
- **Speaker-Diarization**: Unterscheidung zwischen verschiedenen Sprechern
- **Tags/Kategorien**: Automatische Kategorisierung basierend auf Inhalt
- **Suche**: Volltextsuche über alle Transkripte
