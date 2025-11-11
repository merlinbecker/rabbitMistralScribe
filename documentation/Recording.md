
# Recording Workflow

Dieses Dokument beschreibt den vollständigen Ablauf der Audio-Aufnahme-Verarbeitung von der Aufnahme bis zur Speicherung in GitHub.

## Übersicht

Die Anwendung ermöglicht es Benutzern, Audio-Notizen aufzunehmen, die automatisch transkribiert, zusammengefasst und in einem GitHub-Repository gespeichert werden. Der Workflow ist für Offline-Unterstützung konzipiert und verarbeitet Aufnahmen automatisch über ein **Job Queue System** mit einem **push-basierten Worker**.

## Architektur-Überblick

### Job Queue System

Die Anwendung verwendet ein **Queue-basiertes System** zur asynchronen Verarbeitung von Transkriptions-Aufgaben:

- **JobQueue** (`server/jobQueue.ts`): Verwaltet Transkriptions-Jobs in der Replit Database
- **TranscriptionWorker** (`server/transcriptionWorker.ts`): Verarbeitet Jobs sequentiell
- **Push-basiert**: Worker wird benachrichtigt, wenn neue Jobs hinzugefügt werden (kein Polling)
- **Sequentielle Verarbeitung**: Jobs werden nacheinander abgearbeitet, bis die Queue leer ist

### Job Status-Zustandsmaschine

```
pending → processing → completed
    ↓           ↓
    └─→ failed ←┘
        (max 3 attempts)
```

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

**4.1 Aufnahme-Erstellung und Job-Enqueuing:**

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
  
  // Job in Queue einreihen
  await JobQueue.enqueue(recording.id, req.session.userId);
  
  // Worker benachrichtigen (push-basiert)
  TranscriptionWorker.notifyNewJob();
  
  return res.json(recording);
});
```

**4.2 Job Queue Verarbeitung (`server/jobQueue.ts`):**

Die JobQueue verwaltet alle Transkriptions-Jobs:

```typescript
// Job hinzufügen
static async enqueue(recordingId: string, userId: string): Promise<string> {
  const jobId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const job: TranscriptionJob = {
    id: jobId,
    recordingId,
    userId,
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  
  await db.set(`job:transcription:${jobId}`, JSON.stringify(job));
  return jobId;
}

// Nächsten Job abrufen
static async dequeue(): Promise<TranscriptionJob | null> {
  const keys = await db.list('job:transcription:');
  
  for (const key of keys) {
    const job = JSON.parse(await db.get(key));
    
    if (job.status === 'pending' && job.attempts < 3) {
      job.status = 'processing';
      job.attempts++;
      await db.set(key, JSON.stringify(job));
      return job;
    }
  }
  
  return null;
}
```

**4.3 TranscriptionWorker - Push-basierte Verarbeitung (`server/transcriptionWorker.ts`):**

Der Worker wird beim Server-Start initialisiert und wartet auf Job-Benachrichtigungen:

```typescript
export class TranscriptionWorker {
  private static isRunning = false;
  private static isProcessing = false;

  // Wird beim Server-Start aufgerufen
  static start(): void {
    this.isRunning = true;
    console.log('[WORKER] ✅ Started - push-based processing enabled');
  }

  // Wird aufgerufen, wenn ein neuer Job zur Queue hinzugefügt wird
  static async notifyNewJob(): Promise<void> {
    if (!this.isRunning || this.isProcessing) {
      return; // Worker verarbeitet bereits oder ist gestoppt
    }

    console.log('[WORKER] 🔔 New job notification received, starting processing');
    await this.processQueue();
  }

  // Sequentielle Verarbeitung aller Jobs in der Queue
  private static async processQueue(): Promise<void> {
    this.isProcessing = true;

    try {
      // Verarbeite Jobs bis Queue leer ist
      while (this.isRunning) {
        const job = await JobQueue.dequeue();
        
        if (!job) {
          console.log('[WORKER] Queue is empty, waiting for new jobs');
          break; // Queue leer - warte auf Benachrichtigung
        }

        console.log('[WORKER] Processing job:', job.id);

        try {
          await this.transcribeRecording(job.recordingId, job.userId);
          await JobQueue.markCompleted(job.id);
        } catch (error) {
          if (job.attempts < 3) {
            await JobQueue.requeue(job.id);
          } else {
            await JobQueue.markFailed(job.id, error.message);
            await storage.updateRecording(job.recordingId, { status: 'failed' });
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
```

**4.4 Transkription mit Mistral API:**

```typescript
private static async transcribeRecording(recordingId: string, userId: string): Promise<void> {
  const recording = await storage.getRecording(recordingId);
  const settings = await storage.getUserSettings(userId);
  
  // Status auf 'transcribing' setzen
  await storage.updateRecording(recordingId, { status: 'transcribing' });
  
  // Audio-Daten vorbereiten
  const audioData = recording.audioUrl.split(',')[1];
  const audioBuffer = Buffer.from(audioData, 'base64');
  
  // Mistral Voxtral API aufrufen
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'voxtral-24.02');
  
  const transcriptionResponse = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.mistralApiKey}` },
    body: formData,
  });
  
  const transcript = (await transcriptionResponse.json()).text;
  
  // Zusammenfassung und Titel generieren (siehe nächste Schritte)
  // ...
}
```

**4.5 Zusammenfassung erstellen:**

```typescript
// Mistral Chat API für Zusammenfassung
const summaryResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${settings.mistralApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'mistral-large-latest',
    messages: [
      {
        role: 'system',
        content: settings.summaryTemplate || 'Du bist ein Assistent, der Audio-Notizen zusammenfasst...'
      },
      { role: 'user', content: `Bitte fasse diese Notiz zusammen:\n\n${transcript}` }
    ],
  }),
});

const summary = (await summaryResponse.json()).choices[0].message.content;
```

**4.6 Titel generieren:**

```typescript
const titleResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${settings.mistralApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'mistral-large-latest',
    messages: [
      {
        role: 'system',
        content: 'Erstelle einen einzeiligen Titel (maximal 60 Zeichen)...'
      },
      { role: 'user', content: `Erstelle einen kurzen Titel für diese Notiz:\n\n${transcript}` }
    ],
  }),
});

let title = (await titleResponse.json()).choices[0].message.content.trim();
if (title.length > 60) {
  title = title.substring(0, 57) + '...';
}
```

**4.7 Datenbank aktualisieren:**

```typescript
await storage.updateRecording(recordingId, {
  title,
  transcript,
  summary,
  status: 'transcribed',
});

// GitHub-Speicherung falls konfiguriert
if (settings.githubRepoOwner && settings.githubRepoName) {
  await this.saveToGitHub(recordingId, userId);
}
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

### 6. Client-Aktualisierung

**Client-Seite**

**6.1 Status-Polling:**

- Der Client pollt alle 15 Sekunden den Server
- Überprüft den Status der Aufnahme
- Maximale Polling-Dauer: 4 Minuten (16 Polls)

```typescript
const pollInterval = setInterval(async () => {
  const updatedRecordings = await fetch('/api/recordings').then(r => r.json());
  const updated = updatedRecordings.find((r: Recording) => r.id === recordingId);
  
  if (updated?.status === 'transcribed') {
    clearInterval(pollInterval);
    await indexedDB.deleteRecording(localId);
    queryClient.invalidateQueries({ queryKey: ['/api/recordings'] });
  }
}, 15000);
```

**6.2 UI-Aktualisierung:**

- Status-Badge wechselt von "Ausstehend" → "Verarbeitung" → "Transkribiert"
- Titel wird prominent angezeigt
- Zusammenfassung wird als Vorschau dargestellt
- Audio-Aufnahme wird aus IndexedDB gelöscht

## Datenmodell

### Job Schema

```typescript
export interface TranscriptionJob {
  id: string;
  recordingId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  createdAt: string;
  processedAt?: string;
  error?: string;
}
```

### Recording Schema

```typescript
export const recordings = {
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
}
```

### Status-Zustandsmaschinen

**Recording Status:**
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

**Job Status:**
```
pending → processing → completed
    ↓           ↓
    └─→ failed ←┘
     (max 3 Versuche)
```

## Fehlerbehandlung

### Client-seitig

- **Mikrofonzugriff fehlgeschlagen**: Toast-Benachrichtigung
- **Upload fehlgeschlagen**: Status auf 'failed' in IndexedDB, bleibt für erneuten Versuch gespeichert
- **Transkription fehlgeschlagen**: Toast-Benachrichtigung mit Hinweis auf API-Schlüssel-Prüfung

### Server-seitig (Job Queue)

- **Fehlende Mistral API-Schlüssel**: Job als 'failed' markieren
- **Transkriptions-Fehler**: 
  - Wenn `attempts < 3`: Job wird zurück in Queue (requeued)
  - Wenn `attempts >= 3`: Job als 'failed' markieren, Recording-Status auf 'failed' setzen
- **GitHub-Upload-Fehler**: Job schlägt fehl (Transkript bleibt in DB gespeichert)

### Retry-Mechanismus

```typescript
try {
  await this.transcribeRecording(job.recordingId, job.userId);
  await JobQueue.markCompleted(job.id);
} catch (error) {
  if (job.attempts < 3) {
    // Job erneut versuchen
    await JobQueue.requeue(job.id);
  } else {
    // Maximale Versuche erreicht
    await JobQueue.markFailed(job.id, error.message);
    await storage.updateRecording(job.recordingId, { status: 'failed' });
  }
}
```

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

- **Audio**: Als base64 in der Replit Database
- **IndexedDB**: Temporäre Client-seitige Speicherung für Offline-Unterstützung
- **GitHub**: Permanente Markdown-Dateien im `audio-notes/` Verzeichnis
- **Job Queue**: Jobs werden in Replit Database gespeichert und nach 1 Stunde automatisch bereinigt

### Job Queue Limits

- **Maximale Versuche**: 3 pro Job
- **Cleanup**: Abgeschlossene Jobs werden nach 1 Stunde automatisch gelöscht
- **Concurrency**: Sequentielle Verarbeitung (ein Job nach dem anderen)

### Polling

- **Client-Intervall**: 15 Sekunden
- **Maximale Dauer**: 4 Minuten (16 Polls)
- **Automatische Bereinigung**: Nach erfolgreicher Transkription

## Workflow-Diagramm

```
[Client]                    [Server]                  [Worker]              [External APIs]
   │                           │                         │                         │
   │ Upload Recording          │                         │                         │
   │──────────────────────────>│                         │                         │
   │                           │ Create Recording        │                         │
   │                           │ Enqueue Job             │                         │
   │                           │────────────────────────>│                         │
   │                           │ Notify Worker           │                         │
   │                           │─────────────────────────>│                        │
   │                           │                         │ Dequeue Job            │
   │                           │                         │ Process Job            │
   │                           │                         │ Transcribe             │
   │                           │                         │────────────────────────>│
   │                           │                         │<────────────────────────│
   │                           │                         │ Summarize              │
   │                           │                         │────────────────────────>│
   │                           │                         │<────────────────────────│
   │                           │                         │ Generate Title         │
   │                           │                         │────────────────────────>│
   │                           │                         │<────────────────────────│
   │                           │<────────────────────────│ Update Recording        │
   │                           │                         │ Save to GitHub         │
   │                           │                         │────────────────────────>│
   │ Poll Status               │                         │                         │
   │──────────────────────────>│                         │                         │
   │<──────────────────────────│                         │                         │
   │ (status: transcribed)     │                         │                         │
```

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
- **WebSockets**: Echtzeit-Updates statt Client-Polling
- **Batch-Verarbeitung**: Parallele Verarbeitung mehrerer Jobs mit Concurrency-Limit
- **Speaker-Diarization**: Unterscheidung zwischen verschiedenen Sprechern
- **Tags/Kategorien**: Automatische Kategorisierung basierend auf Inhalt
- **Suche**: Volltextsuche über alle Transkripte
- **Job Prioritäten**: Wichtige Jobs können vorgezogen werden
- **Job Monitoring**: Dashboard zur Überwachung der Queue-Performance
