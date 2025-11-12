# 🔧 Troubleshooting Guide

Dieser Guide hilft bei häufigen Problemen und deren Lösungen.

## Inhaltsverzeichnis
- [Authentifizierung](#authentifizierung)
- [Audio-Aufnahme](#audio-aufnahme)
- [Transkription](#transkription)
- [Offline-Modus](#offline-modus)
- [GitHub-Integration](#github-integration)
- [Build-Probleme](#build-probleme)

---

## Authentifizierung

### Problem: "GitHub OAuth is not configured"

**Symptome:**
- Fehler beim Versuch, sich anzumelden
- Fehlermeldung im Server-Log

**Lösung:**
1. Überprüfe, ob `GITHUB_CLIENT_ID` und `GITHUB_CLIENT_SECRET` gesetzt sind:
   ```bash
   echo $GITHUB_CLIENT_ID
   echo $GITHUB_CLIENT_SECRET
   ```
2. Stelle sicher, dass die Werte korrekt in `.env` oder Replit Secrets eingetragen sind
3. Starte den Server neu, damit die Variablen geladen werden

### Problem: "OAuth callback failed"

**Symptome:**
- Redirect zu `/?error=oauth_failed` nach GitHub-Login

**Mögliche Ursachen & Lösungen:**

1. **Falsche Callback URL**:
   - Überprüfe die Callback URL in deiner GitHub OAuth App
   - Development: `http://localhost:5000/api/auth/github/callback`
   - Production: `https://your-domain.com/api/auth/github/callback`

2. **Falsche Client Credentials**:
   - Verifiziere Client ID und Secret in GitHub App Settings
   - Stelle sicher, dass keine führenden/folgenden Leerzeichen vorhanden sind

3. **Session Secret fehlt**:
   - `SESSION_SECRET` muss gesetzt sein (min. 32 Zeichen)
   - Generiere einen neuen Secret:
     ```bash
     openssl rand -base64 32
     ```

### Problem: Session läuft zu schnell ab

**Symptome:**
- Automatischer Logout nach kurzer Zeit

**Lösung:**
- Die Session-Dauer ist auf 30 Tage gesetzt (siehe `server/routes.ts`)
- Überprüfe Browser-Cookies (sollten nicht blockiert sein)
- Stelle sicher, dass `httpOnly` und `secure` korrekt konfiguriert sind

---

## Audio-Aufnahme

### Problem: Mikrofon-Zugriff fehlgeschlagen

**Symptome:**
- Error: "Mikrofonzugriff fehlgeschlagen"
- Aufnahme startet nicht

**Lösungen:**

1. **Browser-Berechtigungen**:
   - Überprüfe, ob der Browser Mikrofon-Zugriff erlaubt
   - Chrome/Edge: Klicke auf das Schloss-Icon in der Adressleiste
   - Firefox: Klicke auf das Mikrofon-Icon in der Adressleiste

2. **HTTPS erforderlich**:
   - MediaRecorder API funktioniert nur über HTTPS (oder localhost)
   - In Production: Stelle sicher, dass HTTPS aktiv ist

3. **Gerät verfügbar**:
   - Überprüfe, ob ein Mikrofon angeschlossen ist
   - Teste das Mikrofon in anderen Apps

### Problem: LED-Display zeigt keine Visualisierung

**Symptome:**
- Schwarze LEDs während der Aufnahme

**Lösungen:**

1. **Audio-Stream nicht verbunden**:
   - Überprüfe Browser-Console auf Fehler
   - Stelle sicher, dass `AudioContext` unterstützt wird

2. **Performance-Problem**:
   - Schließe andere Tabs/Apps
   - Reduziere System-Last

3. **Browser-Kompatibilität**:
   - Verwende einen modernen Browser (Chrome, Firefox, Edge)
   - Safari hat eingeschränkte Web Audio API Unterstützung

### Problem: Aufnahme stoppt nicht

**Symptome:**
- Button reagiert nicht
- Timer läuft weiter

**Lösung:**
1. Seite neu laden (F5)
2. Überprüfe Browser-Console auf JavaScript-Fehler
3. Stelle sicher, dass keine anderen Audio-Apps das Mikrofon blockieren

---

## Transkription

### Problem: "Mistral API Key ungültig"

**Symptome:**
- Transkription schlägt fehl
- Error: "Invalid API Key"

**Lösungen:**

1. **API Key überprüfen**:
   - Gehe zu Settings
   - Verifiziere den Mistral API Key
   - Generiere einen neuen Key auf [console.mistral.ai](https://console.mistral.ai)

2. **API Key Format**:
   - Key sollte mit bestimmten Präfix beginnen
   - Keine Leerzeichen vor/nach dem Key

### Problem: Transkription bleibt bei "pending" hängen

**Symptome:**
- Status ändert sich nicht von "pending"
- Keine Fortschritts-Updates

**Lösungen:**

1. **Worker-Status überprüfen**:
   ```bash
   curl http://localhost:5000/health
   ```
   - `worker` sollte "up" sein

2. **Job-Queue überprüfen**:
   - Überprüfe Server-Logs auf Worker-Fehler
   - Restart der App: `npm run dev`

3. **Mistral API erreichbar**:
   - Teste API-Verbindung:
     ```bash
     curl https://api.mistral.ai/v1/models
     ```

### Problem: Transkription ist ungenau

**Symptome:**
- Viele Fehler im transkribierten Text
- Falsche Wörter

**Lösungen:**

1. **Audio-Qualität verbessern**:
   - Spreche deutlicher
   - Reduziere Hintergrundgeräusche
   - Verwende ein besseres Mikrofon

2. **Sprache überprüfen**:
   - Mistral unterstützt hauptsächlich Englisch und Deutsch
   - Für andere Sprachen kann die Qualität variieren

3. **Model-Parameter anpassen**:
   - Siehe Mistral API Dokumentation
   - In `server/mistralService.ts` anpassbar

### Problem: Zusammenfassung ist generisch

**Symptome:**
- Zusammenfassung enthält wenig Details
- Nicht hilfreich

**Lösungen:**

1. **Prompt-Template anpassen**:
   - Gehe zu Settings
   - Passe das Zusammenfassungs-Template an
   - Füge spezifische Anweisungen hinzu

2. **Längere Aufnahmen**:
   - Mehr Kontext führt zu besseren Zusammenfassungen
   - Spreche strukturierter

---

## Offline-Modus

### Problem: Aufnahmen werden nicht synchronisiert

**Symptome:**
- Offline-Aufnahmen bleiben lokal
- Keine Upload nach Online-Schaltung

**Lösungen:**

1. **Browser-Console überprüfen**:
   - Suche nach "[SYNC]" Logs
   - Fehler bei Upload?

2. **IndexedDB überprüfen**:
   - Browser DevTools → Application → IndexedDB
   - Sind Recordings vorhanden?

3. **Manueller Reload**:
   - Seite neu laden (F5)
   - Sync wird automatisch getriggert

### Problem: Service Worker registriert nicht

**Symptome:**
- PWA-Installation nicht möglich
- Offline-Modus funktioniert nicht

**Lösungen:**

1. **HTTPS erforderlich**:
   - Service Worker funktioniert nur über HTTPS (außer localhost)

2. **Browser-Unterstützung**:
   - Verwende einen modernen Browser
   - Safari hat eingeschränkte Service Worker Unterstützung

3. **Service Worker Cache löschen**:
   - Chrome: DevTools → Application → Service Workers → Unregister
   - Seite neu laden

---

## GitHub-Integration

### Problem: "GitHub file creation failed"

**Symptome:**
- Markdown-Export schlägt fehl
- Fehler im Recording

**Lösungen:**

1. **Repository-Berechtigungen**:
   - Überprüfe, ob du Schreibrechte hast
   - GitHub Token muss `repo` Scope haben

2. **Repository existiert**:
   - Verifiziere Owner und Repo-Name in Settings
   - Format: `owner/repo` (z.B. `username/my-notes`)

3. **Branch existiert**:
   - Standard-Branch sollte existieren (main/master)
   - GitHub erstellt Ordner automatisch

### Problem: Markdown-Dateien nicht sichtbar

**Symptome:**
- Export erfolgreich, aber keine Dateien in GitHub

**Lösungen:**

1. **Ordner-Pfad überprüfen**:
   - Dateien werden in `audio-notes/` gespeichert
   - Überprüfe diesen Ordner im Repo

2. **GitHub Cache**:
   - Refresh die Repository-Seite
   - Cache kann verzögert sein

---

## Build-Probleme

### Problem: "vitest: not found"

**Symptome:**
- Tests können nicht ausgeführt werden

**Lösung:**
```bash
# Dependencies neu installieren
rm -rf node_modules package-lock.json
npm install
```

### Problem: TypeScript-Fehler beim Build

**Symptome:**
- Build schlägt mit TS-Fehlern fehl

**Lösungen:**

1. **Type-Check ausführen**:
   ```bash
   npm run check
   ```

2. **Bekannte TypeScript-Warnungen**:
   - Einige pre-existing Warnungen sind bekannt
   - Build funktioniert trotzdem (`vite build` ist weniger streng)

3. **Dependencies aktualisieren**:
   ```bash
   npm update
   ```

### Problem: Vite Build ist langsam

**Symptome:**
- Build dauert sehr lange

**Lösungen:**

1. **Node-Module cache löschen**:
   ```bash
   rm -rf node_modules/.vite
   ```

2. **Produktions-Build nutzt Optimierungen**:
   - Langsam ist normal, wird gecached

---

## Performance-Probleme

### Problem: Hohe CPU-Last

**Symptome:**
- System wird langsam während Aufnahme

**Lösungen:**

1. **LED-Visualisierung ist rechenintensiv**:
   - Dies ist normal bei Echtzeit-Audio-Analyse
   - Schließe andere Apps

2. **Browser-Tabs reduzieren**:
   - Audio-Processing benötigt Ressourcen

### Problem: Langsame API-Responses

**Symptome:**
- Transkription dauert sehr lange

**Lösungen:**

1. **Mistral API kann langsam sein**:
   - Je nach Server-Last
   - Audio-Länge beeinflusst Dauer

2. **Netzwerk-Verbindung**:
   - Überprüfe Internet-Geschwindigkeit
   - Große Audio-Files brauchen länger zum Upload

---

## Logs & Debugging

### Server-Logs anzeigen

**Development:**
```bash
npm run dev
# Logs werden direkt angezeigt
```

**Production:**
```bash
npm start
# Logs in stdout
```

### Browser-Console

Öffne DevTools (F12) und suche nach:
- `[AUTH]` - Authentifizierungs-Logs
- `[SYNC]` - Sync-Logs
- `[RECORDING]` - Aufnahme-Logs
- `[WORKER]` - Worker-Logs

### Health Check

Überprüfe System-Status:
```bash
curl http://localhost:5000/health
```

Erwartete Response:
```json
{
  "status": "healthy",
  "services": {
    "database": "up",
    "worker": "up"
  }
}
```

---

## Weiterführende Hilfe

Falls dein Problem hier nicht aufgeführt ist:

1. **GitHub Issues durchsuchen**:
   - [Bestehende Issues](https://github.com/merlinbecker/rabbitMistralScribe/issues)

2. **Neues Issue erstellen**:
   - Beschreibe das Problem detailliert
   - Füge Logs und Screenshots hinzu
   - Nenne Browser und OS-Version

3. **Community fragen**:
   - Diskussionen auf GitHub
   - Relevante Discord/Slack-Channels

---

**Letzte Aktualisierung:** November 2025
