# 📖 RabbitMistralScribe - Benutzerhandbuch

Willkommen bei RabbitMistralScribe! Dieses Handbuch zeigt dir, wie du die App optimal nutzt.

## Inhaltsverzeichnis
- [Erste Schritte](#erste-schritte)
- [Audio-Notizen erstellen](#audio-notizen-erstellen)
- [Recordings verwalten](#recordings-verwalten)
- [Settings konfigurieren](#settings-konfigurieren)
- [GitHub-Integration nutzen](#github-integration-nutzen)
- [Offline-Modus](#offline-modus)
- [Tipps & Tricks](#tipps--tricks)

---

## Erste Schritte

### 1. Anmeldung

1. Öffne die App im Browser
2. Klicke auf **"Mit GitHub anmelden"**
3. Autorisiere die App in GitHub
4. Du wirst zur Startseite weitergeleitet

> **Hinweis:** Die App verwendet GitHub OAuth für sichere Authentifizierung. Deine Audio-Daten werden niemals mit GitHub geteilt.

### 2. Mistral API Key konfigurieren

Für die Transkription benötigst du einen Mistral API Key:

1. Erstelle einen Account auf [console.mistral.ai](https://console.mistral.ai)
2. Generiere einen API Key im Dashboard
3. Gehe in der App zu **Settings** (⚙️ Icon)
4. Füge deinen API Key ein
5. Klicke auf **"Speichern"**

> **BYOK (Bring Your Own Key):** Du behältst die volle Kontrolle über deine API-Nutzung und Kosten.

---

## Audio-Notizen erstellen

### Aufnahme starten

**Auf dem Rabbit R1:**
- Drücke den **sideClick Button**

**Im Browser:**
- Klicke auf den großen **roten Aufnahme-Button**
- Oder drücke **Ctrl+S** (nur in Development)

### Während der Aufnahme

- Das **LED-Display** zeigt die Audio-Frequenzen in Echtzeit
  - 🔴 **Rot:** Hohe Frequenzen
  - 🟡 **Gelb:** Mittlere Frequenzen
  - 🟠 **Orange:** Tiefe Frequenzen

- Der **Timer** zeigt die Aufnahmedauer
- Spreche klar und deutlich ins Mikrofon

### Aufnahme beenden

- Drücke erneut den **sideClick Button** / Aufnahme-Button
- Oder **Ctrl+S** im Browser

### Was passiert danach?

1. **Lokale Speicherung:** Audio wird in IndexedDB gespeichert (Offline-Support)
2. **Upload:** Bei Internetverbindung wird die Datei hochgeladen
3. **Transkription:** Mistral wandelt deine Sprache in Text um
4. **KI-Analyse:** 
   - Automatische Zusammenfassung wird erstellt
   - Passender Titel wird generiert
5. **GitHub-Export:** (Optional) Markdown-Datei wird in dein Repo gespeichert

> **Tipp:** Die Verarbeitung läuft im Hintergrund. Du kannst weitere Aufnahmen erstellen, während andere verarbeitet werden.

---

## Recordings verwalten

### Recording-Liste

Auf der Startseite siehst du alle deine Aufnahmen:

- **Status-Badges:**
  - 🟡 **Pending:** Wartet auf Upload
  - 🔵 **Uploading:** Wird hochgeladen
  - 🟣 **Transcribing:** Wird transkribiert
  - 🟢 **Completed:** Fertig verarbeitet
  - 🔴 **Failed:** Fehler aufgetreten

### Recordings filtern

- **Status-Filter:** Zeige nur Recordings mit bestimmtem Status
- **Suchfunktion:** Durchsuche Transkriptionen und Zusammenfassungen
- Verwende die **Suchleiste** am oberen Rand

### Recording-Details ansehen

Klicke auf ein Recording, um Details zu sehen:

- **Transkript:** Vollständiger Text deiner Aufnahme
- **Zusammenfassung:** KI-generierte Zusammenfassung
- **Titel:** Automatisch generierter Titel
- **Dauer:** Aufnahmelänge
- **Erstellungsdatum:** Wann wurde aufgenommen
- **GitHub-Link:** Link zur Markdown-Datei (falls exportiert)

### Recordings löschen

1. Klicke auf das **Papierkorb-Icon** (🗑️)
2. Bestätige die Aktion
3. Recording wird permanent gelöscht

> **Achtung:** Gelöschte Recordings können nicht wiederhergestellt werden!

---

## Settings konfigurieren

Gehe zu **Settings** (⚙️ Icon) um die App anzupassen:

### Mistral API Key

```
📝 Mistral API Key
┌─────────────────────────────┐
│ ●●●●●●●●●●●●●●●●●●●●●●●●●● │
└─────────────────────────────┘
✅ API Key ist gespeichert
```

- Füge deinen Mistral API Key ein
- Der Key wird verschlüsselt gespeichert
- Nur die Länge ist für dich sichtbar (aus Sicherheitsgründen)

### GitHub Repository

```
🐙 GitHub Repository für Export
┌─────────────────────────────┐
│ Owner: dein-username        │
│ Repo:  meine-notizen        │
└─────────────────────────────┘
```

- **Owner:** Dein GitHub-Username oder Organisation
- **Repo:** Repository-Name (muss existieren)
- Format: `owner/repo`

**Voraussetzungen:**
- Du musst Schreibrechte auf das Repo haben
- Das Repo sollte bereits existieren
- Die App erstellt automatisch den Ordner `audio-notes/`

### Zusammenfassungs-Template

Passe an, wie die KI deine Aufnahmen zusammenfasst:

**Standard-Template:**
```
Erstelle eine prägnante Zusammenfassung der folgenden 
Transkription in Stichpunkten. Fokussiere dich auf die 
Hauptpunkte und wichtigsten Informationen.
```

**Beispiel für angepasstes Template:**
```
Erstelle eine Zusammenfassung mit:
1. Hauptthema
2. Wichtigste Erkenntnisse (3-5 Punkte)
3. Handlungsschritte (falls vorhanden)
4. Offene Fragen

Stil: Professionell, prägnant
```

> **Tipp:** Experimentiere mit verschiedenen Prompts, um die besten Ergebnisse für deinen Anwendungsfall zu bekommen!

---

## GitHub-Integration nutzen

### Warum GitHub-Integration?

- **Versionskontrolle:** Alle Notizen sind versioniert
- **Zugänglich überall:** Zugriff via GitHub-Website oder Apps
- **Markdown-Format:** Leicht lesbar und bearbeitbar
- **Backup:** Automatisches Backup deiner Notizen

### Setup

1. **GitHub-Repo erstellen:**
   ```bash
   # Via GitHub Website oder CLI
   gh repo create meine-audio-notizen --private
   ```

2. **In Settings eintragen:**
   - Owner: `dein-username`
   - Repo: `meine-audio-notizen`

3. **Fertig!** Neue Recordings werden automatisch exportiert

### Struktur im Repo

```
meine-audio-notizen/
└── audio-notes/
    ├── 2025-11-12-14-30-meeting-notes.md
    ├── 2025-11-12-15-45-brainstorming.md
    └── 2025-11-13-09-00-daily-standup.md
```

### Markdown-Format

Jede Notiz wird als Markdown-Datei gespeichert:

```markdown
# Meeting-Notizen

*Erstellt von RabbitMistralScribe*

## Zusammenfassung

- Hauptpunkt 1
- Hauptpunkt 2
- Hauptpunkt 3

## Vollständige Transkription

Hier steht der komplette transkribierte Text...

---

*Aufnahmedauer: 5:23*
*Erstellt: 12.11.2025, 14:30*
```

### Markdown bearbeiten

Du kannst die Dateien direkt in GitHub bearbeiten:

1. Öffne die Datei in GitHub
2. Klicke auf das **Stift-Icon** (Edit)
3. Bearbeite den Text
4. Klicke auf **Commit changes**

> **Hinweis:** Änderungen in GitHub werden NICHT zurück in die App synchronisiert. GitHub ist nur ein Export-Ziel.

---

## Offline-Modus

### Wie funktioniert Offline?

1. **Service Worker:** Cached die App für Offline-Nutzung
2. **IndexedDB:** Speichert Aufnahmen lokal
3. **Auto-Sync:** Synchronisiert bei Verbindung automatisch

### Offline aufnehmen

1. App funktioniert auch ohne Internet
2. Erstelle Aufnahmen wie gewohnt
3. Recordings werden lokal gespeichert
4. Status zeigt **"pending"** oder **"uploading"**

### Zurück online

- Synchronisation startet automatisch
- Alle offline-Recordings werden hochgeladen
- Transkription beginnt nach Upload
- Status-Updates erscheinen in Echtzeit

### PWA installieren

**Auf dem Handy:**
1. Öffne die App im Browser
2. Browser zeigt **"Zum Startbildschirm hinzufügen"**
3. Bestätige die Installation
4. App erscheint als Icon auf dem Home-Screen

**Auf dem Desktop:**
1. Chrome/Edge zeigen Install-Icon in der Adressleiste
2. Klicke auf **"Installieren"**
3. App öffnet in eigenem Fenster

---

## Tipps & Tricks

### Beste Audio-Qualität

✅ **Do's:**
- Spreche klar und deutlich
- Halte das Mikrofon nahe am Mund (ca. 10-20cm)
- Ruhige Umgebung wählen
- Gleichmäßige Lautstärke beibehalten

❌ **Don'ts:**
- Zu schnell sprechen
- Hintergrundgeräusche (TV, Musik)
- Wind direkt ins Mikrofon
- Zu leise sprechen

### Effiziente Zusammenfassungen

**Strukturiert sprechen:**
```
"Heute möchte ich über drei Themen sprechen:
Erstens: ...
Zweitens: ...
Drittens: ..."
```

**Klare Abschnitte:**
- Nutze Pausen zwischen Themen
- Benenne Themen explizit
- Wiederhole wichtige Punkte am Ende

### Keyboard-Shortcuts (Browser)

| Shortcut | Aktion |
|----------|--------|
| `Ctrl+S` | Aufnahme starten/stoppen (Dev) |
| `F5` | Seite neu laden |
| `F12` | DevTools öffnen |

### Rabbit R1 Optimierungen

- **Display:** Perfekt optimiert für 240x282px
- **sideClick:** Natürlicher Workflow für Aufnahmen
- **LED-Display:** Große, gut sichtbare Visualisierung
- **Kompaktes UI:** Alle wichtigen Infos auf einen Blick

### Kosten optimieren (Mistral API)

**Reduziere API-Kosten:**
- Kürzere Aufnahmen → weniger Transkriptions-Kosten
- Nutze Zusammenfassungs-Template effizient
- Überprüfe Kosten regelmäßig im Mistral Dashboard

**Ungefähre Kosten (Stand Nov 2025):**
- Voxtral (STT): ~$0.12 pro Stunde Audio
- Mistral Large (Zusammenfassung): ~$0.004 pro 1K tokens

> **Beispiel:** 5-Minuten-Aufnahme ≈ $0.01-0.02 Gesamtkosten

---

## Häufige Fragen (FAQ)

### Wo werden meine Daten gespeichert?

- **Audio:** Replit Database (temporär während Verarbeitung)
- **Transkripte:** Replit Database (permanent)
- **Offline:** IndexedDB in deinem Browser
- **Export:** Dein GitHub Repository (optional)

### Ist meine Privatsphäre geschützt?

✅ **Ja:**
- End-to-End: Du kontrollierst deine Keys
- BYOK: Deine Mistral API Key, deine Daten
- Keine Drittweitergabe an Dritte
- GitHub OAuth: Standard OAuth2-Flow

### Kann ich mehrere Geräte nutzen?

Ja, aber mit Einschränkungen:
- **Session:** Bleibt für 30 Tage aktiv
- **Recordings:** Werden in der Cloud gespeichert
- **Offline:** Jedes Gerät hat eigene lokale Kopien

### Was passiert bei API-Limits?

- Mistral hat Limits basierend auf deinem Plan
- Bei Überschreitung: Fehler wird angezeigt
- Lösung: Upgrade deinen Mistral-Plan

### Unterstützte Sprachen?

**Transkription (Voxtral):**
- 🇩🇪 Deutsch (sehr gut)
- 🇬🇧 Englisch (sehr gut)
- 🇫🇷 Französisch (gut)
- 🇪🇸 Spanisch (gut)
- Weitere Sprachen: Variabel

---

## Weitere Hilfe benötigt?

📖 **Dokumentation:**
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [GitHub Repository](https://github.com/merlinbecker/rabbitMistralScribe)

💬 **Support:**
- [GitHub Issues](https://github.com/merlinbecker/rabbitMistralScribe/issues)
- [GitHub Discussions](https://github.com/merlinbecker/rabbitMistralScribe/discussions)

---

**Viel Erfolg mit RabbitMistralScribe! 🎙️**

*Letzte Aktualisierung: November 2025*
