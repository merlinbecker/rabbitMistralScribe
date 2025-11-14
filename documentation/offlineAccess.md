# Offline Access Dokumentation

## Übersicht

RabbitMistralScribe bietet umfangreiche Offline-Funktionalität, die es Benutzern ermöglicht, Audio-Notizen auch ohne Internetverbindung aufzunehmen und zu speichern. Sobald die Verbindung wiederhergestellt ist, werden die Aufnahmen automatisch synchronisiert und verarbeitet.

## Architektur

Die Offline-Funktionalität basiert auf drei Hauptkomponenten:

### 1. Service Worker (PWA)

Der Service Worker ermöglicht es der App, als Progressive Web App (PWA) zu funktionieren und macht sie vollständig offline-fähig.

**Datei:** `public/service-worker.js`

#### Features:

- **Cache-Strategien:**
  - **Static Cache:** Icons, Manifest und Kernressourcen werden beim Install gecacht
  - **Dynamic Cache:** JavaScript und CSS werden bei erster Nutzung gecacht
  - **Cache-First für Assets:** Bilder, Fonts und Icons werden aus dem Cache geladen
  - **Network-First für Seiten:** HTML-Seiten werden bevorzugt aus dem Netzwerk geladen

- **Background Sync:**
  - Registriert Background-Sync-Events für automatische Synchronisation
  - Sendet Messages an die App wenn das Gerät online kommt

- **Cache-Versioning:**
  - Automatisches Cleanup alter Cache-Versionen
  - Separate Caches für statische und dynamische Inhalte

#### Caching-Verhalten:

```javascript
// Statische Assets (cache-first)
- Images (.png, .jpg, .jpeg, .gif, .svg, .ico)
- Fonts (.woff, .woff2, .ttf, .eot)
- Icons und Manifest

// Dynamische Inhalte (network-first, fallback to cache)
- JavaScript Bundles
- CSS Stylesheets
- HTML Seiten

// Nie gecacht:
- API-Aufrufe (/api/*)
- POST/PUT/DELETE Requests
```

### 2. IndexedDB Storage

IndexedDB wird verwendet, um Audio-Aufnahmen lokal zu speichern, bis sie erfolgreich hochgeladen und verarbeitet wurden.

**Datei:** `client/src/lib/indexedDB.ts`

#### Datenstruktur:

```typescript
interface LocalRecording {
  id: string;                    // Lokale UUID
  audioBlob: Blob;               // Audio-Datei als Blob
  duration: number;              // Dauer in Sekunden
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  createdAt: Date;               // Erstellungszeitpunkt
  serverRecordingId?: string;    // Server-ID nach Upload
  title?: string;                // Titel (nach Transkription)
  transcript?: string;           // Transkript (nach Verarbeitung)
  summary?: string;              // Zusammenfassung (nach Verarbeitung)
}
```

#### Status-Flow:

```
queued → uploading → uploaded → (gelöscht nach Transkription)
   ↓                    ↓
 failed  ← ← ← ← ← ← failed
```

#### API:

- `init()` - Initialisiert die IndexedDB
- `addRecording(recording)` - Fügt neue Aufnahme hinzu
- `getAllRecordings()` - Lädt alle lokalen Aufnahmen
- `updateRecording(id, updates)` - Aktualisiert eine Aufnahme
- `deleteRecording(id)` - Löscht eine Aufnahme
- `clear()` - Löscht alle Aufnahmen

### 3. Synchronisations-Logik

Die Synchronisation erfolgt automatisch an mehreren Stellen:

**Datei:** `client/src/pages/home.tsx`

#### Trigger für Synchronisation:

1. **Bei App-Start:** Prüfung auf ausstehende Uploads nach 1 Sekunde
2. **Bei Online-Event:** Sofortige Synchronisation wenn Netzwerk verfügbar wird
3. **Nach jeder Aufnahme:** Direkter Upload-Versuch wenn online
4. **Background-Sync-Event:** Vom Service Worker initiiert

#### Upload-Logik mit Retry:

```typescript
// Exponential Backoff bei Fehlern
retryWithBackoff(uploadFunction, {
  maxRetries: 3,
  initialDelay: 1000ms,
  maxDelay: 10000ms,
  backoffMultiplier: 2
});
```

#### Status-Updates:

- Lokale Aufnahmen werden mit Server-Daten angereichert
- Transkripte und Summaries werden vom Server in IndexedDB synchronisiert
- Nach erfolgreicher Transkription wird die lokale Kopie gelöscht

## Benutzer-Feedback

### Offline-Indikator

**Komponente:** `client/src/components/OfflineIndicator.tsx`

Zeigt einen orangefarbenen Banner am oberen Bildschirmrand wenn offline:
- Icon: WiFi-Off Symbol
- Text: "Offline-Modus - Aufnahmen werden lokal gespeichert"
- Verschwindet automatisch wenn online

### Toast-Benachrichtigungen

#### Während Aufnahme:
- ✅ "Aufnahme gestartet - Sprechen Sie jetzt..."
- ✅ "Aufnahme gespeichert - Die Aufnahme wird verarbeitet..."

#### Bei Upload:
- 🟢 Online: "Aufnahme hochgeladen - Die Transkription läuft im Hintergrund..."
- 🟠 Offline: "Aufnahme gespeichert - Wird hochgeladen, sobald Verbindung besteht."
- 🔴 Fehler: "Upload fehlgeschlagen - Aufnahme bleibt lokal gespeichert."

#### Nach Transkription:
- ✅ "Erfolgreich transkribiert - Die Notiz wurde transkribiert und in GitHub gespeichert."
- ❌ "Transkription fehlgeschlagen - Bitte prüfen Sie Ihren Mistral API-Schlüssel."

## Implementierungs-Details

### Network Status Detection

**Hook:** `client/src/hooks/useOnlineStatus.ts`

Nutzt native Browser-Events:
- `navigator.onLine` - Initial Status
- `window.addEventListener('online')` - Online-Event
- `window.addEventListener('offline')` - Offline-Event

### Retry-Mechanismus

**Utility:** `client/src/utils/retryWithBackoff.ts`

Implementiert exponential backoff für fehlerhafte Netzwerk-Requests:

```typescript
// Beispiel: 3 Versuche mit steigenden Wartezeiten
Attempt 1: Sofort
Attempt 2: Nach 1 Sekunde
Attempt 3: Nach 2 Sekunden
Attempt 4: Nach 4 Sekunden
```

### Synchronisations-Flow

```
1. Aufnahme → IndexedDB (status: queued)
2. UI-Update (zeigt "pending")
3. Wenn online:
   a. Upload mit Retry-Logic (status: uploading)
   b. Bei Erfolg: serverRecordingId speichern (status: uploaded)
   c. Bei Fehler: status: failed
4. Polling für Transkription (15s Intervall, max 4 Minuten)
5. Nach Transkription: Lokale Kopie löschen
```

### Fehlerbehandlung

#### Network-Fehler:
- Automatische Wiederholung mit exponential backoff
- Max 3 Versuche pro Upload
- Status wird auf 'failed' gesetzt bei endgültigem Fehler

#### Speicher-Fehler:
- Toast-Benachrichtigung für Benutzer
- Fehlermeldung wird in Console geloggt
- Aufnahme wird nicht gespeichert

#### API-Fehler:
- Status wird auf 'failed' gesetzt
- Benutzer wird über Toast informiert
- Automatische Wiederholung bei nächster Online-Verbindung

## Testing

### Manuelle Tests:

1. **Offline-Modus simulieren:**
   ```javascript
   // In Browser DevTools
   navigator.onLine = false;
   window.dispatchEvent(new Event('offline'));
   ```

2. **Aufnahme ohne Internet:**
   - DevTools: Network → Offline
   - Aufnahme erstellen
   - Prüfen ob in IndexedDB gespeichert
   - Network → Online
   - Prüfen ob automatisch hochgeladen

3. **Service Worker Cache:**
   - Application Tab → Service Workers
   - Cache Storage prüfen
   - Offline gehen und App neu laden

### Automatisierte Tests:

Erstelle Tests für:
- IndexedDB Manager
- Retry-Mechanismus
- Online Status Hook
- Synchronisations-Logik

## Performance-Optimierungen

### Cache-Größen-Management:
- Nur notwendige Assets werden gecacht
- Audio-Blobs werden nach Transkription gelöscht
- Alte Cache-Versionen werden automatisch entfernt

### Netzwerk-Optimierungen:
- Retry nur für temporäre Fehler (nicht 4xx)
- Exponential backoff verhindert Server-Überlastung
- Polling wird automatisch gestoppt wenn keine pending items

### Speicher-Optimierungen:
- Audio als Blob (komprimierter als Base64)
- Metadata wird minimal gehalten
- Automatisches Cleanup nach erfolgreicher Synchronisation

## Bekannte Limitierungen

1. **IndexedDB Quota:**
   - Browser limitieren den verfügbaren Speicher
   - Große Audio-Dateien können Probleme verursachen
   - Keine explizite Quota-Verwaltung implementiert

2. **Background Sync:**
   - Nicht in allen Browsern unterstützt (z.B. Firefox)
   - Fallback auf manuelle Synchronisation

3. **Service Worker Scope:**
   - Funktioniert nur über HTTPS (außer localhost)
   - Muss vom Root-Pfad registriert werden

4. **Polling-Limitierungen:**
   - Max 4 Minuten Polling (16 Versuche à 15s)
   - Keine automatische Wiederholung nach Timeout

## Zukünftige Verbesserungen

### Mögliche Erweiterungen:

1. **Quota Management:**
   - Warnung bei niedrigem Speicher
   - Automatisches Cleanup alter Aufnahmen
   - Benutzer-Interface für Speicherverwaltung

2. **Erweiterte Sync-Strategie:**
   - Priority Queue für wichtige Uploads
   - Batch-Uploads für bessere Performance
   - Delta-Sync für teilweise Uploads

3. **Offline-Transkription:**
   - WebAssembly-basierte lokale Transkription
   - Fallback wenn kein Internet verfügbar
   - Optionale Feature-Flag

4. **Konflikt-Auflösung:**
   - Handling von gleichzeitigen Änderungen
   - Merge-Strategien für Offline-Edits
   - Conflict-Resolution-UI

5. **Erweiterte Diagnostics:**
   - Sync-Status-Dashboard
   - Netzwerk-Qualität-Monitoring
   - Error-Reporting-Integration

## Fehlerbehebung

### Problem: Aufnahmen werden nicht synchronisiert

**Lösung:**
1. Browser-Console öffnen und nach Fehlermeldungen suchen
2. Network-Tab prüfen ob API-Requests erfolgreich sind
3. Application → IndexedDB → audio-notes-db → pending-recordings prüfen
4. Service Worker Status prüfen (Application → Service Workers)

### Problem: "Service Worker registration failed"

**Lösung:**
1. Prüfen ob HTTPS verwendet wird (außer localhost)
2. service-worker.js Pfad korrekt?
3. Browser-Cache leeren
4. Service Worker manuell unregistrieren und neu laden

### Problem: Cache wird nicht aktualisiert

**Lösung:**
1. Cache-Version erhöhen in service-worker.js
2. Hard-Reload (Ctrl+Shift+R / Cmd+Shift+R)
3. Application → Cache Storage → Alle Caches löschen

## Best Practices

### Für Entwickler:

1. **Immer offline testen** vor jedem Release
2. **Fehlerbehandlung** für alle asynchronen Operationen
3. **User Feedback** für alle kritischen Aktionen
4. **Logging** für Debugging-Zwecke (mit console.log)
5. **Cache-Versioning** bei Service Worker Änderungen

### Für Benutzer:

1. **Regelmäßig online gehen** um Aufnahmen zu synchronisieren
2. **Browser-Cache** nicht zu oft leeren
3. **HTTPS verwenden** für volle PWA-Funktionalität
4. **Speicher prüfen** bei vielen lokalen Aufnahmen

## Zusammenfassung

Die Offline-Funktionalität von RabbitMistralScribe bietet:

✅ **Vollständige Offline-Fähigkeit** - Aufnahmen ohne Internet möglich
✅ **Automatische Synchronisation** - Keine manuelle Intervention nötig
✅ **Robuste Fehlerbehandlung** - Retry-Mechanismen und User-Feedback
✅ **Progressive Enhancement** - Funktioniert mit und ohne Service Worker
✅ **Effizienter Speicher** - Automatisches Cleanup nach Synchronisation
✅ **Benutzerfreundlich** - Klare Status-Anzeigen und Benachrichtigungen

Die Implementierung folgt moderne PWA Best Practices und bietet eine zuverlässige Offline-Erfahrung für Benutzer des Rabbit R1 Geräts und andere Plattformen.
