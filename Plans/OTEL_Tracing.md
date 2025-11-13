# Konzept: OpenTelemetry Tracing mit Langfuse

## Zusammenfassung

Dieses Konzept beschreibt die Integration von OpenTelemetry (OTEL) Tracing mit Langfuse in die rabbitMistralScribe-Anwendung. Der Fokus liegt auf der vollständigen Nachvollziehbarkeit aller Operationen, insbesondere der Mistral AI API-Aufrufe, mit konfigurierbarem Sampling über Umgebungsvariablen.

## 1. Was ist OpenTelemetry?

OpenTelemetry ist ein Open-Source-Framework für Observability, das standardisierte APIs, SDKs und Tools für die Erfassung von Telemetriedaten (Traces, Metrics, Logs) bereitstellt. Es ermöglicht:

- **Distributed Tracing**: Verfolgung von Requests über mehrere Services hinweg
- **Vendor-Neutralität**: Unabhängigkeit von spezifischen Monitoring-Plattformen
- **Standardisierung**: Einheitliche Instrumentierung über verschiedene Sprachen und Frameworks
- **Flexibilität**: Export zu verschiedenen Backends (Langfuse, Jaeger, Grafana, etc.)

### Kernkonzepte

- **Traces**: Repräsentieren den gesamten Pfad eines Requests durch die Anwendung
- **Spans**: Einzelne Operationen innerhalb eines Trace (z.B. API-Call, Datenbankabfrage)
- **Context Propagation**: Weitergabe von Trace-Informationen über Service-Grenzen hinweg
- **Sampling**: Konfigurierbare Auswahl, welche Traces erfasst werden

## 2. Warum Langfuse?

Langfuse ist eine spezialisierte Observability-Plattform für LLM-Anwendungen mit:

- **Native OpenTelemetry-Integration**: Vollständige Unterstützung über `@langfuse/otel`
- **LLM-spezifische Features**: Tracking von Tokens, Kosten, Prompts und Responses
- **Dashboard & Analytics**: Visualisierung von LLM-Performance und -Kosten
- **Flexible Deployment**: Cloud-Version (EU/US) oder Self-Hosted
- **Zero-Code-Export**: Automatische Erfassung ohne Code-Änderungen

## 3. Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                      Express Application                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │           OpenTelemetry Instrumentation Layer             │ │
│  │  - Auto-Instrumentation (HTTP, Express)                   │ │
│  │  - Manual Spans (Custom Business Logic)                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Application Services                          │ │
│  │  ┌─────────────────┐  ┌──────────────────┐                │ │
│  │  │ MistralService  │  │ TranscriptionW.  │                │ │
│  │  │  - transcribe   │  │  - processQueue  │                │ │
│  │  │  - summarize    │  │  - saveToGitHub  │                │ │
│  │  │  - generateTitle│  │                  │                │ │
│  │  └─────────────────┘  └──────────────────┘                │ │
│  │         ⬇ Traced                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │  LangfuseSpanProcessor       │
                │  - Sampling Decision         │
                │  - Span Enrichment           │
                │  - Batch Processing          │
                └──────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │   Langfuse Backend           │
                │   (cloud.langfuse.com)       │
                │   - Trace Storage            │
                │   - Analytics Dashboard      │
                │   - Cost Tracking            │
                └──────────────────────────────┘
```

## 4. Implementierungsstrategie

### 4.1 Phase 1: Grundlegende OTEL-Integration

#### Schritt 1: Dependencies installieren

```bash
npm install @opentelemetry/sdk-node \
            @opentelemetry/api \
            @opentelemetry/auto-instrumentations-node \
            @langfuse/otel
```

**Packages:**
- `@opentelemetry/sdk-node`: OpenTelemetry Node.js SDK
- `@opentelemetry/api`: Core API für manuelle Instrumentierung
- `@opentelemetry/auto-instrumentations-node`: Auto-Instrumentierung für HTTP, Express, etc.
- `@langfuse/otel`: Langfuse Span Processor für OTEL-Integration

#### Schritt 2: Instrumentation Setup erstellen

**Neue Datei:** `server/instrumentation.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Initialize OpenTelemetry with Langfuse integration
 * Must be called before any other imports
 */
export function initializeTracing() {
  // Check if tracing is enabled
  const tracingEnabled = process.env.OTEL_TRACING_ENABLED !== 'false';
  
  if (!tracingEnabled) {
    console.log('[OTEL] Tracing is disabled');
    return;
  }

  // Validate required Langfuse credentials
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    console.warn('[OTEL] Langfuse credentials not configured - tracing disabled');
    return;
  }

  console.log('[OTEL] Initializing OpenTelemetry with Langfuse...');

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'rabbitMistralScribe',
      [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    }),
    
    // Auto-instrument HTTP, Express, and other Node.js frameworks
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          // Filter out health checks and static assets
          ignoreIncomingRequestHook: (request) => {
            const url = request.url || '';
            return url.includes('/health') || 
                   url.includes('/service-worker.js') ||
                   url.startsWith('/assets/');
          },
        },
      }),
    ],

    // Langfuse Span Processor
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log('[OTEL] OpenTelemetry initialized successfully');
  console.log('[OTEL] Service:', process.env.OTEL_SERVICE_NAME || 'rabbitMistralScribe');
  console.log('[OTEL] Sampling:', process.env.OTEL_TRACES_SAMPLER || 'parentbased_always_on');
  console.log('[OTEL] Langfuse URL:', process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[OTEL] Tracing terminated'))
      .catch((error) => console.error('[OTEL] Error shutting down tracing', error));
  });
}
```

#### Schritt 3: Integration in den Server

**Datei:** `server/index.ts`

```typescript
// WICHTIG: Instrumentation muss VOR allen anderen Imports erfolgen
import { initializeTracing } from './instrumentation';
initializeTracing();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
// ... rest of imports
```

### 4.2 Phase 2: Manuelle Instrumentierung für Mistral Service

Die Auto-Instrumentierung erfasst HTTP-Calls automatisch, aber für bessere Insights sollten wir manuelle Spans für kritische Operationen hinzufügen.

**Datei:** `server/mistralService.ts`

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export class MistralService implements IMistralService {
  private readonly tracer = trace.getTracer('mistral-service');
  
  // ... existing code ...

  async transcribeAudio(
    audioBuffer: Buffer,
    apiKey: string,
  ): Promise<TranscriptionResult> {
    // Create a span for this operation
    return await this.tracer.startActiveSpan(
      'mistral.transcribeAudio',
      {
        attributes: {
          'mistral.model': this.sttModel,
          'mistral.operation': 'transcription',
          'audio.size_bytes': audioBuffer.length,
        },
      },
      async (span) => {
        try {
          const startTime = Date.now();
          
          const formData = new FormData();
          const blob = new Blob([audioBuffer], { type: "audio/webm" });
          formData.append("file", blob, "audio.webm");
          formData.append("model", this.sttModel);

          const response = await fetch(this.transcriptionUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorText });
            span.recordException(new Error(`Mistral transcription failed: ${response.statusText}`));
            throw new Error(
              `Mistral transcription failed: ${response.statusText} - ${errorText}`,
            );
          }

          const data = await response.json();
          const duration = Date.now() - startTime;
          
          // Add metadata to span
          span.setAttributes({
            'mistral.response.status': response.status,
            'mistral.response.duration_ms': duration,
            'mistral.response.text_length': data.text.length,
          });
          
          span.setStatus({ code: SpanStatusCode.OK });
          return { text: data.text };
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  async summarizeText(
    text: string,
    apiKey: string,
    customTemplate?: string,
  ): Promise<SummarizationResult> {
    return await this.tracer.startActiveSpan(
      'mistral.summarizeText',
      {
        attributes: {
          'mistral.model': this.chatModel,
          'mistral.operation': 'summarization',
          'input.text_length': text.length,
          'mistral.template.custom': !!customTemplate,
        },
      },
      async (span) => {
        try {
          const startTime = Date.now();
          const defaultTemplate = "Du bist ein Assistent, der Audio-Notizen zusammenfasst...";
          const systemPrompt = customTemplate || defaultTemplate;

          const response = await fetch(this.chatUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.chatModel,
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `Bitte fasse diese Notiz zusammen:\n\n${text}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorText });
            span.recordException(new Error(`Mistral summarization failed: ${response.statusText}`));
            throw new Error(
              `Mistral summarization failed: ${response.statusText} - ${errorText}`,
            );
          }

          const data = await response.json();
          const duration = Date.now() - startTime;
          
          span.setAttributes({
            'mistral.response.status': response.status,
            'mistral.response.duration_ms': duration,
            'mistral.response.summary_length': data.choices[0].message.content.length,
          });
          
          span.setStatus({ code: SpanStatusCode.OK });
          return { summary: data.choices[0].message.content };
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }

  async generateTitle(
    text: string,
    apiKey: string,
  ): Promise<TitleGenerationResult> {
    return await this.tracer.startActiveSpan(
      'mistral.generateTitle',
      {
        attributes: {
          'mistral.model': this.chatModel,
          'mistral.operation': 'title_generation',
          'input.text_length': text.length,
        },
      },
      async (span) => {
        try {
          const startTime = Date.now();
          const systemPrompt = "Fasse mir den Inhalt so kurz wie möglich zusammen...";

          const response = await fetch(this.chatUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.chatModel,
              messages: [
                { role: "system", content: systemPrompt },
                {
                  role: "user",
                  content: `Erstelle einen kurzen und knackigen Titel für diese Notiz:\n\n${text}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorText });
            span.recordException(new Error(`Mistral title generation failed: ${response.statusText}`));
            throw new Error(
              `Mistral title generation failed: ${response.statusText} - ${errorText}`,
            );
          }

          const data = await response.json();
          const duration = Date.now() - startTime;
          let title = data.choices[0].message.content.trim();

          if (title.length > 60) {
            title = title.substring(0, 57) + "...";
          }
          
          span.setAttributes({
            'mistral.response.status': response.status,
            'mistral.response.duration_ms': duration,
            'mistral.response.title': title,
          });
          
          span.setStatus({ code: SpanStatusCode.OK });
          return { title };
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

### 4.3 Phase 3: Worker-Instrumentierung

**Datei:** `server/transcriptionWorker.ts`

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

export class TranscriptionWorker {
  private readonly tracer = trace.getTracer('transcription-worker');
  
  // ... existing code ...

  private async transcribeRecording(recordingId: string, userId: string): Promise<void> {
    return await this.tracer.startActiveSpan(
      'worker.transcribeRecording',
      {
        attributes: {
          'recording.id': recordingId,
          'user.id': userId,
        },
      },
      async (span) => {
        try {
          console.log('[WORKER] Starting transcription for recording:', recordingId);
          
          const recording = await this.storage.getRecording(recordingId);
          if (!recording) {
            throw new Error('Recording not found');
          }

          span.setAttributes({
            'recording.duration': recording.duration || 0,
            'recording.has_audio': !!recording.audioUrl,
          });

          const settings = await this.storage.getUserSettings(userId);
          if (!settings?.mistralApiKey) {
            throw new Error('No Mistral API key configured');
          }

          // Update status
          await this.storage.updateRecording(recordingId, { status: 'transcribing' });

          // Get audio data
          if (!recording.audioUrl) {
            throw new Error('No audio URL in recording');
          }

          const audioData = recording.audioUrl.split(',')[1];
          const audioBuffer = Buffer.from(audioData, 'base64');

          // These calls are already instrumented in MistralService
          const transcriptionResult = await this.mistralService.transcribeAudio(
            audioBuffer, 
            settings.mistralApiKey
          );
          const transcript = transcriptionResult.text;

          const summaryResult = await this.mistralService.summarizeText(
            transcript,
            settings.mistralApiKey,
            settings.summaryTemplate || undefined
          );
          const summary = summaryResult.summary;

          let title = 'Audio-Notiz';
          try {
            const titleResult = await this.mistralService.generateTitle(
              transcript, 
              settings.mistralApiKey
            );
            title = titleResult.title;
          } catch (error) {
            console.warn('[WORKER] Title generation failed, using default:', error);
          }

          // Update recording
          await this.storage.updateRecording(recordingId, {
            title,
            transcript,
            summary,
            status: 'transcribed',
          });

          span.setAttributes({
            'recording.transcript_length': transcript.length,
            'recording.summary_length': summary.length,
            'recording.title': title,
          });

          // Save to GitHub if configured
          if (settings.githubRepoOwner && settings.githubRepoName) {
            await this.saveToGitHub(recordingId, userId);
            span.setAttribute('github.saved', true);
          }

          // Delete audio file
          await this.storage.updateRecording(recordingId, {
            audioUrl: undefined,
          });

          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.recordException(error as Error);
          throw error;
        } finally {
          span.end();
        }
      }
    );
  }
}
```

## 5. Sampling-Konfiguration

### 5.1 Sampling-Strategien

OpenTelemetry unterstützt verschiedene Sampling-Strategien über Umgebungsvariablen:

| Strategie | Beschreibung | Verwendung |
|-----------|--------------|------------|
| `always_on` | Erfasst alle Traces (100%) | Development, Debugging |
| `always_off` | Erfasst keine Traces (0%) | Tracing deaktivieren |
| `traceidratio` | Erfasst einen konfigurierbaren Prozentsatz | Production mit fixer Rate |
| `parentbased_always_on` | Parent-basiert, neue Traces immer erfassen | Standard-Development |
| `parentbased_traceidratio` | Parent-basiert mit Rate | **Empfohlen für Production** |

### 5.2 Umgebungsvariablen-Konfiguration

**Neue Variablen in `.env.example`:**

```env
# ============================================================================
# OpenTelemetry Tracing Configuration
# ============================================================================

# Enable/Disable OpenTelemetry tracing (default: true)
OTEL_TRACING_ENABLED=true

# Service name for telemetry (default: rabbitMistralScribe)
OTEL_SERVICE_NAME=rabbitMistralScribe

# Sampling Strategy
# Options: always_on, always_off, traceidratio, parentbased_always_on, parentbased_traceidratio
# Recommended for production: parentbased_traceidratio
OTEL_TRACES_SAMPLER=parentbased_traceidratio

# Sampling ratio (0.0 to 1.0) - only used with traceidratio samplers
# Examples:
#   0.01 = 1% of traces
#   0.1  = 10% of traces
#   1.0  = 100% of traces
OTEL_TRACES_SAMPLER_ARG=0.1

# ============================================================================
# Langfuse Configuration
# ============================================================================

# Langfuse Public Key (get from https://cloud.langfuse.com)
LANGFUSE_PUBLIC_KEY=pk-lf-...

# Langfuse Secret Key (get from https://cloud.langfuse.com)
LANGFUSE_SECRET_KEY=sk-lf-...

# Langfuse Base URL
# EU Cloud: https://cloud.langfuse.com (default)
# US Cloud: https://us.cloud.langfuse.com
# Self-hosted: https://your-langfuse-instance.com
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

### 5.3 Empfohlene Konfigurationen nach Umgebung

#### Development
```env
OTEL_TRACING_ENABLED=true
OTEL_TRACES_SAMPLER=always_on
# Keine SAMPLER_ARG nötig
```

**Vorteil:** Vollständige Trace-Erfassung für Debugging

#### Staging
```env
OTEL_TRACING_ENABLED=true
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.5
```

**Vorteil:** 50% Sampling für realistisches Testing ohne zu viel Overhead

#### Production (Low Traffic)
```env
OTEL_TRACING_ENABLED=true
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

**Vorteil:** 10% Sampling reicht für Monitoring bei geringem Traffic

#### Production (High Traffic)
```env
OTEL_TRACING_ENABLED=true
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.01
```

**Vorteil:** 1% Sampling reduziert Kosten bei hohem Traffic

## 6. Trace-Struktur für Mistral-Endpoints

Ein vollständiger Trace für eine Audio-Transkription würde so aussehen:

```
📊 Trace: POST /api/recordings (Root Span)
  ├─ 🔄 Span: Express Handler
  │   ├─ Attribute: http.method = POST
  │   ├─ Attribute: http.route = /api/recordings
  │   └─ Attribute: http.status_code = 200
  │
  ├─ 📝 Span: worker.transcribeRecording
  │   ├─ Attribute: recording.id = rec_123
  │   ├─ Attribute: user.id = user_456
  │   ├─ Attribute: recording.duration = 120
  │   │
  │   ├─ 🎤 Span: mistral.transcribeAudio
  │   │   ├─ Attribute: mistral.model = voxtral-24.02
  │   │   ├─ Attribute: mistral.operation = transcription
  │   │   ├─ Attribute: audio.size_bytes = 1048576
  │   │   ├─ Attribute: mistral.response.status = 200
  │   │   ├─ Attribute: mistral.response.duration_ms = 3450
  │   │   └─ Attribute: mistral.response.text_length = 850
  │   │
  │   ├─ 📋 Span: mistral.summarizeText
  │   │   ├─ Attribute: mistral.model = mistral-large-latest
  │   │   ├─ Attribute: mistral.operation = summarization
  │   │   ├─ Attribute: input.text_length = 850
  │   │   ├─ Attribute: mistral.template.custom = false
  │   │   ├─ Attribute: mistral.response.status = 200
  │   │   ├─ Attribute: mistral.response.duration_ms = 1200
  │   │   └─ Attribute: mistral.response.summary_length = 95
  │   │
  │   ├─ 🏷️  Span: mistral.generateTitle
  │   │   ├─ Attribute: mistral.model = mistral-large-latest
  │   │   ├─ Attribute: mistral.operation = title_generation
  │   │   ├─ Attribute: input.text_length = 850
  │   │   ├─ Attribute: mistral.response.status = 200
  │   │   ├─ Attribute: mistral.response.duration_ms = 800
  │   │   └─ Attribute: mistral.response.title = "Meeting Notes"
  │   │
  │   └─ 🐙 Span: github.saveToGitHub (optional)
  │       ├─ Attribute: github.repo = user/repo
  │       └─ Attribute: github.file_url = https://...
```

### Wichtige Span-Attribute für Mistral AI

| Attribut | Beschreibung | Beispiel |
|----------|--------------|----------|
| `mistral.model` | Verwendetes Mistral-Modell | `voxtral-24.02` |
| `mistral.operation` | Art der Operation | `transcription`, `summarization` |
| `mistral.response.status` | HTTP-Statuscode | `200` |
| `mistral.response.duration_ms` | Antwortzeit in Millisekunden | `3450` |
| `audio.size_bytes` | Größe der Audio-Datei | `1048576` |
| `input.text_length` | Länge des Input-Textes | `850` |
| `mistral.response.text_length` | Länge der Transkription | `850` |
| `mistral.template.custom` | Custom Template verwendet? | `true`/`false` |

## 7. Langfuse Dashboard & Analytics

### 7.1 Was wird in Langfuse sichtbar?

Nach der Integration werden im Langfuse Dashboard folgende Informationen verfügbar:

1. **Traces Overview**
   - Alle Traces mit ihren Root-Spans
   - Gesamt-Duration pro Trace
   - Status (Success/Error)
   - Timestamp

2. **Trace Details**
   - Vollständiger Span-Tree
   - Alle Attribute und Events
   - Exceptions und Errors
   - Timeline-Visualisierung

3. **Analytics**
   - Durchschnittliche Latenz pro Operation
   - Error-Rate nach Endpoint
   - Token-Verbrauch (wenn konfiguriert)
   - Kosten-Tracking

4. **Filtering & Search**
   - Nach User-ID
   - Nach Recording-ID
   - Nach Mistral-Model
   - Nach Zeitraum

### 7.2 Beispiel-Queries in Langfuse

```sql
-- Finde langsame Transkriptionen (> 5 Sekunden)
SELECT * FROM traces 
WHERE span.name = 'mistral.transcribeAudio' 
  AND span.duration_ms > 5000

-- Fehlerrate nach Mistral-Operation
SELECT 
  span.attributes['mistral.operation'],
  COUNT(*) as total,
  SUM(CASE WHEN span.status = 'ERROR' THEN 1 ELSE 0 END) as errors
FROM traces
GROUP BY span.attributes['mistral.operation']
```

## 8. Implementierungs-Checkliste

### Schritt-für-Schritt-Plan

- [ ] **Dependencies installieren**
  ```bash
  npm install @opentelemetry/sdk-node @opentelemetry/api @opentelemetry/auto-instrumentations-node @langfuse/otel
  ```

- [ ] **Instrumentation-Datei erstellen**
  - Neue Datei: `server/instrumentation.ts`
  - NodeSDK initialisieren
  - LangfuseSpanProcessor konfigurieren
  - Graceful Shutdown implementieren

- [ ] **Integration in server/index.ts**
  - Import von `instrumentation.ts` VOR allen anderen Imports
  - `initializeTracing()` aufrufen

- [ ] **MistralService instrumentieren**
  - Tracer initialisieren
  - `transcribeAudio` mit Span wrappen
  - `summarizeText` mit Span wrappen
  - `generateTitle` mit Span wrappen
  - Relevante Attribute hinzufügen

- [ ] **TranscriptionWorker instrumentieren**
  - Tracer initialisieren
  - `transcribeRecording` mit Span wrappen
  - Attribute für Recording und User hinzufügen

- [ ] **Umgebungsvariablen konfigurieren**
  - `.env.example` aktualisieren
  - Langfuse Credentials hinzufügen
  - Sampling-Konfiguration dokumentieren

- [ ] **TypeScript-Types hinzufügen**
  ```bash
  npm install --save-dev @types/node
  ```

- [ ] **Testing**
  - Unit-Tests für instrumentierte Services
  - Integration-Tests mit Mock-Langfuse-Backend
  - Performance-Tests für Overhead

- [ ] **Dokumentation aktualisieren**
  - README.md mit Tracing-Abschnitt erweitern
  - TROUBLESHOOTING.md um Tracing-Probleme ergänzen
  - Environment-Variables dokumentieren

- [ ] **Deployment**
  - Staging: Tracing mit 50% Sampling testen
  - Production: Mit 10% Sampling starten
  - Monitoring: Langfuse Dashboard beobachten

## 9. Performance-Überlegungen

### 9.1 Overhead durch Tracing

OpenTelemetry hat einen minimalen Performance-Overhead:

- **CPU**: < 5% bei Sampling von 10%
- **Memory**: ~10-20 MB zusätzlich für SDK
- **Latency**: < 1ms pro Span
- **Network**: Batch-Export reduziert Netzwerk-Overhead

### 9.2 Optimierungen

1. **Sampling korrekt konfigurieren**
   - Production: 1-10% Sampling
   - Niemals 100% in High-Traffic-Production

2. **Span-Attribute begrenzen**
   - Keine großen Payloads in Attribute
   - Sensible Daten filtern/maskieren

3. **Batch-Export**
   - LangfuseSpanProcessor verwendet automatisch Batching
   - Standard: 512 Spans pro Batch

4. **Selektive Instrumentierung**
   - Health-Checks ausschließen (bereits implementiert)
   - Static-Assets ausschließen (bereits implementiert)

## 10. Sicherheit & Datenschutz

### 10.1 Sensible Daten

**Nicht in Traces speichern:**
- ❌ Mistral API Keys
- ❌ GitHub Access Tokens
- ❌ Session Secrets
- ❌ Vollständige Audio-Daten

**Sicher tracen:**
- ✅ API-Response-Status
- ✅ Latenz-Metriken
- ✅ Error-Messages (ohne sensible Details)
- ✅ Resource-IDs (Recording-ID, User-ID)

### 10.2 Daten-Filterung

Implementierung in `instrumentation.ts`:

```typescript
spanProcessors: [
  new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    // Optional: Filter sensible Attribute
    onSpanCreate: (span) => {
      // Entferne Authorization-Header aus HTTP-Spans
      if (span.attributes['http.request.header.authorization']) {
        delete span.attributes['http.request.header.authorization'];
      }
      return span;
    },
  }),
]
```

## 11. Troubleshooting

### Problem: Keine Traces in Langfuse

**Lösung:**
1. Credentials überprüfen
   ```bash
   echo $LANGFUSE_PUBLIC_KEY
   echo $LANGFUSE_SECRET_KEY
   ```
2. Tracing-Status prüfen
   ```bash
   echo $OTEL_TRACING_ENABLED
   ```
3. Logs analysieren
   ```
   [OTEL] OpenTelemetry initialized successfully
   ```

### Problem: Hohe Latenz durch Tracing

**Lösung:**
1. Sampling reduzieren
   ```env
   OTEL_TRACES_SAMPLER_ARG=0.01  # 1% statt 10%
   ```
2. Span-Attribute reduzieren
3. Performance-Profiling durchführen

### Problem: Traces unvollständig

**Lösung:**
1. Parent-based Sampling verwenden
   ```env
   OTEL_TRACES_SAMPLER=parentbased_traceidratio
   ```
2. Context-Propagation prüfen
3. Span-Lifecycle verifizieren (`.end()` wird aufgerufen)

## 12. Weiterführende Ressourcen

### Offizielle Dokumentation

- [OpenTelemetry Node.js](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Langfuse OpenTelemetry Integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse TypeScript SDK](https://langfuse.com/docs/observability/sdk/typescript/setup)

### Community & Support

- [OpenTelemetry Slack](https://cloud-native.slack.com/)
- [Langfuse Discord](https://discord.gg/7NXusRtqYU)
- [GitHub Discussions](https://github.com/langfuse/langfuse/discussions)

### Tutorials & Beispiele

- [Mistral AI + OpenTelemetry Cookbook](https://docs.mistral.ai/cookbooks/third_party-openlit-cookbook_mistral_opentelemetry)
- [Express + OTEL Best Practices](https://uptrace.dev/opentelemetry/opentelemetry-express.html)
- [Langfuse JS SDK Cookbook](https://langfuse.com/guides/cookbook/js_langfuse_sdk)

## 13. Fazit

Die Integration von OpenTelemetry mit Langfuse bietet:

✅ **Vollständige Transparenz** über alle Mistral AI API-Calls  
✅ **Flexible Sampling-Konfiguration** über Umgebungsvariablen  
✅ **Production-Ready** mit minimalem Performance-Overhead  
✅ **LLM-spezifische Analytics** in Langfuse Dashboard  
✅ **Vendor-Neutral** durch OpenTelemetry-Standard  
✅ **Debugging-Power** für komplexe Transcription-Workflows  

Die vorgeschlagene Implementierung ermöglicht es:
- Mistral-Endpoints nachvollziehbar zu instrumentieren
- Sampling flexibel über Environment-Variables zu steuern
- Performance-Probleme schnell zu identifizieren
- Kosten pro Operation zu tracken
- Fehler-Patterns zu erkennen

Mit dieser Lösung wird rabbitMistralScribe production-ready für Enterprise-Observability!
