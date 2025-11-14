# Status Notification System - Visual Guide

## Vorher (Toast-System)

Das alte System nutzte Toast-Benachrichtigungen, die als Pop-up-Overlays am Rand des Bildschirms erschienen:
- Störende Pop-ups
- Konnten sich überlagern
- Verdeckten teilweise den Inhalt
- Inkonsistente Positionierung

## Nachher (Icon-basiertes System in der Statusleiste)

### Wo werden Benachrichtigungen angezeigt?

Alle Benachrichtigungen erscheinen jetzt **in der oberen Statusleiste**, genau dort wo normalerweise der Online/Offline-Status angezeigt wird.

### Statusleiste Layout

```
┌─────────────────────────────────────────┐
│ 00:00 ●    [ICON] Benachrichtigungstext │
│ ↑          ↑                             │
│ Zeit       Status/Benachrichtigung       │
└─────────────────────────────────────────┘
```

### Icon-Typen

1. **Erfolg (Success)**
   - Icon: ✓ (Grünes Häkchen)
   - Beispiel: "Aufnahme gespeichert"
   - Farbe: Grün

2. **Fehler (Error)**
   - Icon: ✕ (Rotes X)
   - Beispiel: "Upload fehlgeschlagen"
   - Farbe: Rot

3. **Warnung (Warning)**
   - Icon: ⚠ (Gelbes Dreieck)
   - Beispiel: "Wird hochgeladen, sobald Verbindung besteht"
   - Farbe: Gelb

4. **Information (Info)**
   - Icon: ⓘ (Blaues Info-Symbol)
   - Beispiel: "Aufnahme gestartet"
   - Farbe: Blau

### Verhalten

**Normal (keine Benachrichtigung):**
```
┌─────────────────────────────────────────┐
│ 00:00      📶 Online                     │
└─────────────────────────────────────────┘
```

**Mit Benachrichtigung:**
```
┌─────────────────────────────────────────┐
│ 00:00      ✓ Aufnahme gespeichert       │
└─────────────────────────────────────────┘
```

**Nach 10 Sekunden:**
```
┌─────────────────────────────────────────┐
│ 00:00      📶 Online                     │
└─────────────────────────────────────────┘
```

### Queue-System

Wenn mehrere Benachrichtigungen nacheinander kommen:

1. **Erste Benachrichtigung** → Wird sofort angezeigt
2. **Zweite Benachrichtigung** → Wird in die Warteschlange gestellt
3. Nach 10 Sekunden → **Erste verschwindet**, zweite wird angezeigt
4. Nach weiteren 10 Sekunden → **Zweite verschwindet**, zurück zu Online-Status

### Beispiel-Ablauf: Aufnahme speichern

```
T=0s:   📶 Online
        ↓ (Nutzer startet Aufnahme)
        
T=0s:   ⓘ Aufnahme gestartet
        ↓ (10 Sekunden warten)
        
T=10s:  📶 Online
        ↓ (Nutzer stoppt Aufnahme)
        
T=10s:  ✓ Aufnahme gespeichert
        ↓ (10 Sekunden warten)
        
T=20s:  ✓ Aufnahme hochgeladen
        ↓ (10 Sekunden warten)
        
T=30s:  ✓ Erfolgreich transkribiert
        ↓ (10 Sekunden warten)
        
T=40s:  📶 Online
```

## Vorteile

1. **Kein visuelles Rauschen**: Keine Pop-ups, die den Bildschirm überlagern
2. **Konsistente Position**: Immer am selben Ort - oben rechts
3. **Geordnete Anzeige**: Queue verhindert überlappende Benachrichtigungen
4. **Platzsparend**: Nutzt vorhandenen Raum in der Statusleiste
5. **Besser für kleine Bildschirme**: Besonders wichtig für das Rabbit R1-Gerät (240px breit)

## Technische Details

- **Maximale Textbreite**: 120px (mit Truncate und Tooltip für vollständigen Text)
- **Standard-Anzeigedauer**: 10 Sekunden (konfigurierbar)
- **Icons**: Lucide React Icons (CheckCircle2, XCircle, AlertCircle, Info)
- **Responsive**: Passt sich automatisch an die Breite an
