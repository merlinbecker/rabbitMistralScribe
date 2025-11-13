
# Spektrumanalyzer - Analyse & Verbesserungsplan

**Datum:** 13. November 2025  
**Komponente:** `client/src/components/LEDPixelDisplay.tsx`  
**Ziel:** Optimierung der Audio-Frequenzanalyse und -Visualisierung

---

## 📊 Aktuelle Implementierung

### Audio-Setup

```typescript
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;  // → 128 frequency bins
analyser.smoothingTimeConstant = 0.8;

const source = audioContext.createMediaStreamSource(audioStream);
source.connect(analyser);
```

**Parameter:**
- `fftSize`: 256 → ergibt 128 Frequenz-Bins (frequencyBinCount)
- `smoothingTimeConstant`: 0.8 (sehr hoch, dämpft Reaktivität)
- Keine Frequenzbereich-Filterung

### Frequenz-Daten-Extraktion

```typescript
const bufferLength = analyser.frequencyBinCount; // 128 bins
const dataArray = new Uint8Array(bufferLength);

analyser.getByteFrequencyData(dataArray); // Werte 0-255

// Downsampling: 128 bins → 16 Spalten
const columnData = new Uint8Array(16);
const binSize = Math.floor(bufferLength / 16); // = 8 bins pro Spalte

for (let i = 0; i < 16; i++) {
  const start = i * binSize;
  const end = start + binSize;
  let sum = 0;
  for (let j = start; j < end; j++) {
    sum += dataArray[j];
  }
  columnData[i] = Math.floor(sum / binSize); // Einfacher Durchschnitt
}
```

**Probleme:**
- Lineares Downsampling (8 bins → 1 Spalte)
- Keine logarithmische Skalierung
- Keine Fokussierung auf sprachrelevante Frequenzen

### Visualisierung (16x16 Grid)

```typescript
for (let row = 0; row < 16; row++) {
  for (let col = 0; col < 16; col++) {
    const frequency = frequencyData[col];
    const threshold = ((15 - row) / 15) * 255;
    
    let color = '#000000'; // inaktiv
    
    if (frequency > threshold) {
      if (row < 5) {
        color = '#FF4500'; // Rot (Zeile 0-4)
      } else if (row < 11) {
        color = '#FFD700'; // Gelb (Zeile 5-10)
      } else {
        color = '#FF8C00'; // Orange (Zeile 11-15)
      }
    }
  }
}
```

**Mapping:**
- **Spalten (col):** 16 Frequenzbänder (0 = niedrig, 15 = hoch)
- **Zeilen (row):** Amplituden-Schwellenwerte (0 = oben, 15 = unten)
- **Farben:**
  - Zeile 0-4 (oben): Rot → aktuell für "hohe Frequenzen" gedacht
  - Zeile 5-10 (mitte): Gelb → "mittlere Frequenzen"
  - Zeile 11-15 (unten): Orange → "niedrige Frequenzen"

---

## 🔴 Kritische Probleme

### Problem 1: Invertierte Frequenz-zu-Farb-Zuordnung

**Ist-Zustand:**
- Zeile 0 ist OBEN im Display
- Zeile 15 ist UNTEN im Display
- Aber: Zeile 0-4 (oben) = Rot soll "hohe Frequenzen" sein
- Und: Zeile 11-15 (unten) = Orange soll "niedrige Frequenzen" sein

**Problem:**
Die Farbzuordnung basiert auf der **Zeilen-Position**, nicht auf den tatsächlichen **Frequenzen** in den Spalten!

**Korrekte Logik sollte sein:**
- **Spalten** repräsentieren Frequenzbänder:
  - Spalte 0-5: Tiefe Frequenzen (80-500 Hz) → Orange
  - Spalte 6-11: Mittlere Frequenzen (500-2000 Hz) → Gelb
  - Spalte 12-15: Hohe Frequenzen (2000-8000 Hz) → Rot

- **Zeilen** repräsentieren nur die Amplitude (Lautstärke):
  - Je höher die Amplitude, desto mehr Zeilen leuchten (von unten nach oben)

### Problem 2: Ineffizientes Downsampling

**Aktuell:**
```typescript
// Einfacher Durchschnitt über 8 bins
columnData[i] = Math.floor(sum / binSize);
```

**Problem:**
- Keine logarithmische Skalierung (menschliches Gehör ist logarithmisch)
- Verlust von Frequenzauflösung
- Alle Frequenzbereiche werden gleich behandelt

**Besserer Ansatz:**
- Logarithmische Frequenz-Bänder (ähnlich wie Oktaven in der Musik)
- Fokus auf sprachrelevante Frequenzen (80-8000 Hz)

### Problem 3: Fehlende Frequenzbereich-Optimierung

**Aktuell:**
- FFT analysiert 0 Hz bis Nyquist-Frequenz (z.B. 0-24000 Hz bei 48kHz Sampling)
- Sprachrelevanter Bereich: 80-8000 Hz
- **90% der bins werden für nicht-relevante Frequenzen verschwendet!**

**Frequenz-Verteilung bei 48kHz Sampling:**
- Bin 0: 0 Hz (DC)
- Bin 1: 187.5 Hz
- Bin 2: 375 Hz
- ...
- Bin 128: 24000 Hz (Nyquist)

Jeder Bin repräsentiert: 24000 Hz / 128 = 187.5 Hz

**Sprachrelevant:**
- 80 Hz → Bin 0.4
- 8000 Hz → Bin 42.7

**Ergebnis:** Nur die ersten ~43 von 128 bins sind für Sprache relevant!

---

## 🟡 Performance-Probleme

### Problem 4: Unoptimierte Animation Loop

**Aktuell:**
```typescript
const updateFrequencyData = () => {
  analyser.getByteFrequencyData(dataArray);
  // ... Verarbeitung
  animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
};
```

**Problem:**
- Läuft mit Monitor-Refresh-Rate (~60 FPS)
- Bei 60 FPS werden 60x pro Sekunde FFT-Berechnungen gemacht
- Für Audio-Visualisierung reichen 30-40 FPS

**Verschwendete Ressourcen:**
- CPU-Last durch unnötige Berechnungen
- Batterie-Verbrauch auf mobilen Geräten

### Problem 5: Fehlende Normalisierung

**Aktuell:**
- Keine automatische Gain-Anpassung
- Amplitude-Werte 0-255 werden direkt verwendet

**Probleme:**
- Leise Aufnahmen zeigen kaum Aktivität (alle Werte < 50)
- Laute Aufnahmen sind permanent "maxed out" (alle Werte > 200)
- Keine konsistente Visualisierung über verschiedene Lautstärken

**Lösung:**
- RMS (Root Mean Square) basierte Normalisierung
- Automatische Gain-Anpassung mit Smoothing

### Problem 6: Smoothing zu hoch

**Aktuell:**
```typescript
analyser.smoothingTimeConstant = 0.8;
```

**Problem:**
- Wert zwischen 0 (keine Glättung) und 1 (maximale Glättung)
- 0.8 ist sehr hoch → starke Dämpfung
- Audio-Änderungen werden nur langsam sichtbar

**Empfehlung für Live-Visualisierung:**
- 0.5-0.65 für gute Balance zwischen Reaktivität und Stabilität

---

## 🟢 Feature-Erweiterungen

### Feature 1: Peak-Hold Visualisierung

**Aktuell:**
- Nur aktuelle Amplitude wird angezeigt
- Keine "Peak Hold" Funktion

**Vorschlag:**
- Speichere höchste Amplitude pro Spalte
- Zeige Peak mit anderer Farbe (z.B. weiß)
- Decay-Animation: Peak fällt langsam ab (wie bei professionellen Audio-Metern)

**Beispiel:**
```
████ Peak (weiß, hält 500ms)
████ Aktuelle Amplitude (farbig)
░░░░ Inaktiv
```

### Feature 2: Dynamische Farbpalette

**Aktuell:**
- Statische Farben (Rot, Gelb, Orange)
- Keine Anpassung an Audio-Charakteristik

**Vorschlag:**
- Farbintensität basierend auf Gesamt-Energie
- Verschiedene Paletten für verschiedene Audio-Typen:
  - Sprache: Warme Farben (Orange-Gelb-Rot)
  - Musik: Kalte Farben (Blau-Cyan-Grün)
  - Umgebungsgeräusche: Neutrale Farben

### Feature 3: Mel-Scale Filterbank (Optional)

**Aktuell:**
- Lineare Frequenz-Skalierung

**Vorschlag:**
- Mel-Scale für noch bessere Sprachvisualisierung
- Mel-Scale approximiert menschliche Tonhöhenwahrnehmung
- Wird in professionellen Speech-Recognition-Systemen verwendet

**Komplexität:** Hoch (3-4 Stunden Implementierung)

---

## 🎯 Verbesserungsplan

### **Phase 1: Kritische Fixes** (1-2 Stunden)

#### Maßnahme 1.1: Frequenz-zu-Farb-Mapping korrigieren

**Änderung:**
```typescript
// Farbe basierend auf SPALTE (Frequenzband), nicht Zeile!
if (col < 5) {
  color = '#FF8C00'; // Tiefe Frequenzen (Spalte 0-5) → Orange
} else if (col < 11) {
  color = '#FFD700'; // Mittlere Frequenzen (Spalte 6-10) → Gelb
} else {
  color = '#FF4500'; // Hohe Frequenzen (Spalte 11-15) → Rot
}
```

#### Maßnahme 1.2: Logarithmische Frequenz-Skalierung

**Implementierung:**
```typescript
// Logarithmische Frequenz-Bänder berechnen
const minFreq = 80;  // Hz
const maxFreq = 8000; // Hz
const numBands = 16;

const logBands = [];
for (let i = 0; i < numBands; i++) {
  const freqLow = minFreq * Math.pow(maxFreq / minFreq, i / numBands);
  const freqHigh = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / numBands);
  logBands.push({ low: freqLow, high: freqHigh });
}
```

#### Maßnahme 1.3: Frequenzbereich auf 80-8000 Hz eingrenzen

**Implementierung:**
```typescript
const sampleRate = audioContext.sampleRate; // z.B. 48000 Hz
const binWidth = sampleRate / analyser.fftSize; // Hz pro Bin

const minBin = Math.floor(80 / binWidth);     // Bin für 80 Hz
const maxBin = Math.ceil(8000 / binWidth);    // Bin für 8000 Hz

// Nur relevante Bins verwenden
const relevantData = dataArray.slice(minBin, maxBin);
```

**Aufwand:** 1-2 Stunden  
**Priorität:** KRITISCH  
**Impact:** Hoch - Behebt fundamentale Visualisierungsfehler

---

### **Phase 2: Performance-Optimierungen** (2-3 Stunden)

#### Maßnahme 2.1: Frame-Rate auf 40 FPS begrenzen

**Implementierung:**
```typescript
let lastFrameTime = 0;
const targetFPS = 40;
const frameInterval = 1000 / targetFPS; // 25ms

const updateFrequencyData = (timestamp: number) => {
  if (timestamp - lastFrameTime < frameInterval) {
    animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
    return;
  }
  
  lastFrameTime = timestamp;
  // ... FFT-Verarbeitung
};
```

**CPU-Einsparung:** ~33% (von 60 FPS auf 40 FPS)

#### Maßnahme 2.2: Automatische Gain-Normalisierung

**Implementierung:**
```typescript
const rmsRef = useRef<number>(0);
const targetRMS = 100; // Ziel-RMS-Wert

const normalizeData = (data: Uint8Array) => {
  // RMS berechnen
  const sumSquares = data.reduce((sum, val) => sum + val * val, 0);
  const rms = Math.sqrt(sumSquares / data.length);
  
  // Smooth RMS mit Exponential Moving Average
  rmsRef.current = 0.9 * rmsRef.current + 0.1 * rms;
  
  // Gain-Faktor berechnen
  const gain = targetRMS / (rmsRef.current + 1);
  
  // Daten normalisieren
  return data.map(val => Math.min(255, val * gain));
};
```

#### Maßnahme 2.3: Smoothing auf 0.6 reduzieren

**Änderung:**
```typescript
analyser.smoothingTimeConstant = 0.6; // Vorher: 0.8
```

**Aufwand:** 2-3 Stunden  
**Priorität:** HOCH  
**Impact:** Mittel - Verbesserte Reaktivität und reduzierte CPU-Last

---

### **Phase 3: Feature-Erweiterungen** (3-4 Stunden)

#### Maßnahme 3.1: Peak-Hold mit Decay-Animation

**Implementierung:**
```typescript
const peaksRef = useRef<{ value: number; timestamp: number }[]>(
  new Array(16).fill({ value: 0, timestamp: 0 })
);

const PEAK_HOLD_TIME = 500; // ms
const PEAK_DECAY_RATE = 0.95; // pro Frame

const updatePeaks = (columnData: Uint8Array, timestamp: number) => {
  return columnData.map((value, i) => {
    const peak = peaksRef.current[i];
    
    if (value > peak.value) {
      // Neuer Peak
      return { value, timestamp };
    } else if (timestamp - peak.timestamp > PEAK_HOLD_TIME) {
      // Decay
      return { value: peak.value * PEAK_DECAY_RATE, timestamp: peak.timestamp };
    }
    
    return peak;
  });
};

// In der Visualisierung:
// Peak-Pixel mit weißer Farbe rendern
```

#### Maßnahme 3.2: Dynamische Farbpalette

**Implementierung:**
```typescript
const calculateEnergyLevel = (data: Uint8Array): number => {
  const sum = data.reduce((a, b) => a + b, 0);
  return sum / (data.length * 255); // Normalisiert auf 0-1
};

const getColorForFrequency = (col: number, energy: number) => {
  const baseColors = {
    low: '#FF8C00',    // Orange
    mid: '#FFD700',    // Gelb
    high: '#FF4500'    // Rot
  };
  
  // Helligkeit basierend auf Energie anpassen
  const brightness = 0.5 + energy * 0.5; // 0.5 bis 1.0
  
  // ... Color-Mixing-Logik
};
```

#### Maßnahme 3.3: Mel-Scale Filterbank (Optional)

**Komplexität:** Hoch  
**Aufwand:** 3-4 Stunden  
**Priorität:** NIEDRIG (Nice-to-have)

**Vorteile:**
- Noch bessere Sprachvisualisierung
- Professioneller Standard in Speech Recognition

**Nachteile:**
- Höhere Komplexität
- Mehr CPU-Last

**Aufwand:** 3-4 Stunden  
**Priorität:** MITTEL  
**Impact:** Hoch - Professionelle Audio-Meter-Funktionalität

---

## 📈 Erwartete Verbesserungen

### Nach Phase 1:
- ✅ Korrekte Frequenz-zu-Farb-Zuordnung
- ✅ Bessere Auflösung im sprachrelevanten Bereich
- ✅ Fokussierung auf 80-8000 Hz

### Nach Phase 2:
- ✅ ~33% weniger CPU-Last
- ✅ Konsistente Visualisierung bei verschiedenen Lautstärken
- ✅ Schnellere Reaktion auf Audio-Änderungen

### Nach Phase 3:
- ✅ Professionelle Peak-Hold-Visualisierung
- ✅ Anpassbare Farbpaletten
- ✅ Optional: Mel-Scale für optimale Sprachvisualisierung

---

## 🔧 Implementierungs-Reihenfolge

**Empfohlene Reihenfolge:**

1. **Phase 1.3** → Frequenzbereich eingrenzen (einfachste Änderung)
2. **Phase 1.1** → Farb-Mapping korrigieren (kritischer Bug-Fix)
3. **Phase 2.3** → Smoothing reduzieren (eine Zeile)
4. **Phase 2.1** → FPS-Limiting (Performance-Boost)
5. **Phase 1.2** → Logarithmische Skalierung (komplexer)
6. **Phase 2.2** → Gain-Normalisierung (mittlere Komplexität)
7. **Phase 3.1** → Peak-Hold (Feature)
8. **Phase 3.2** → Dynamische Farben (Feature)
9. **Phase 3.3** → Mel-Scale (Optional, komplex)

**Gesamtaufwand:** 6-9 Stunden für Phase 1-3

---

## 📝 Testing-Strategie

### Unit Tests:
- Logarithmische Frequenz-Band-Berechnung
- Normalisierungs-Algorithmus
- Peak-Hold-Logik

### Integration Tests:
- Audio-Stream → FFT → Visualisierung
- Performance-Messungen (FPS, CPU-Last)

### Manual Testing:
- Verschiedene Audio-Quellen (leise, laut, Sprache, Musik)
- Verschiedene Geräte (Desktop, Mobile, Rabbit R1)
- Offline-Modus

---

## 🎨 Visualisierungs-Beispiele

### Vorher (Aktuell):
```
Zeile 0  [████████████████]  Rot (falsch: hohe Zeilen, nicht hohe Frequenzen)
Zeile 5  [████████████░░░░]  Gelb
Zeile 11 [████░░░░░░░░░░░░]  Orange (falsch: tiefe Zeilen, nicht tiefe Frequenzen)
         Spalte 0 → 15 (Frequenzen linear verteilt über 0-24kHz)
```

### Nachher (Ziel):
```
Zeile 0  [████████████████]  Amplitude-Peak (alle Frequenzen)
Zeile 8  [████████░░░░░░░░]  Mittlere Amplitude
Zeile 15 [░░░░░░░░░░░░░░░░]  Inaktiv
         │    │      │    │
         Orange Gelb  Rot  Peak(weiß)
         Tiefe  Mid   Hoch
         80Hz   500Hz 8kHz
```

---

## 🚀 Nächste Schritte

**Sofort:**
1. Entscheidung: Welche Phase soll zuerst implementiert werden?
2. Branch erstellen: `feature/spectrum-analyzer-improvements`
3. Mit Phase 1.3 (Frequenzbereich) beginnen

**Danach:**
- Schrittweise durch die Phasen arbeiten
- Nach jeder Phase testen und committen
- Code-Review vor Merge in main

**Langfristig:**
- User-Feedback sammeln
- Optional: Mel-Scale in Phase 3.3
- Performance-Monitoring in Production
