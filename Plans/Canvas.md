# LED-Anzeige Canvas Umbau - Planungsdokument

**Version:** 1.0  
**Datum:** 2025-11-27  
**Status:** ✅ Implementiert  
**Autor:** AI-basierte Architekturplanung

---

## 1. Executive Summary

Die LED-Pixel-Anzeige `LEDPixelDisplay` rendert derzeit ein 16x16 Pixel-Raster mittels 256 einzelner `<div>`-Elemente im CSS Grid. Dies führt auf schwächeren Geräten wie dem Rabbit R1 zu erheblichen Performance-Problemen aufgrund des hohen DOM-Manipulationsaufwands.

**Lösung:** Umbau der Komponente auf ein Canvas-Element für direktes Pixel-Rendering ohne DOM-Overhead.

---

## 2. Ist-Analyse

### 2.1 Aktuelle Komponente: `LEDPixelDisplay.tsx`

**Struktur:**
```tsx
<div className="w-full aspect-square">
  <div className="grid grid-cols-16 grid-rows-16">
    {256 × <div key="..." style={{backgroundColor, opacity}} />}
  </div>
</div>
```

**Performance-Probleme:**
- 256 DOM-Elemente werden bei jedem Frame erstellt/aktualisiert
- CSS Transitions (`transition-colors duration-75`) erzeugen zusätzlichen Rendering-Overhead
- Bei dynamischen Bitmaps (z.B. AudioSpectrumBitmap) bis zu 60 Updates pro Sekunde
- Jedes Update triggert React Reconciliation für alle 256 Elemente

### 2.2 Schnittstellen und Interfaces

**Props (Neue API):**
```typescript
interface LEDPixelDisplayNewProps {
  bitmap: LEDBitmap | BitmapProvider;
  transition?: TransitionConfig;
  refreshRate?: number;     // Default: 60 Hz
  pixelGap?: number;        // Default: 1px
  borderRadius?: number;    // Default: 1px
  className?: string;
}
```

**Props (Legacy API - Abwärtskompatibel):**
```typescript
interface LEDPixelDisplayLegacyProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}
```

**Bitmap-Typen:**
```typescript
interface LEDPixel {
  color: string;        // Hex-Farbe z.B. '#FF4500'
  brightness?: number;  // 0.0 - 1.0
}

type LEDBitmap = LEDPixel[][];  // 16x16 Array

type BitmapProvider = () => LEDBitmap | Promise<LEDBitmap>;
```

### 2.3 Verwendung im Projekt

Die Komponente wird in `rabbit.tsx` verwendet:
- Audio-Spektrum-Anzeige während Aufnahme
- Mikrofon-Icon wenn keine Audio-Stream
- Mistral-Logo im Leerlauf

---

## 3. Soll-Konzept

### 3.1 Canvas-basierte Implementierung

**Rendering-Ansatz:**
- Einzelnes `<canvas>` Element statt 256 `<div>` Elemente
- Direktes Pixel-Zeichnen via Canvas 2D Context
- Kein CSS-Transition-Overhead

**Optimierungen:**
- Dirty-Checking: Nur neu rendern wenn Bitmap sich ändert
- Antialiasing deaktiviert (`imageSmoothingEnabled = false`)
- Memoization der Canvas-Rendering-Logik
- RequestAnimationFrame für flüssige Updates

### 3.2 Canvas-Struktur

```
┌─────────────────────────────────────────┐
│ Canvas (width: screenWidth)             │
│ ┌─────────────────────────────────────┐ │
│ │ Pixel Grid (16x16)                  │ │
│ │ ┌───┐ ┌───┐ ┌───┐ ...               │ │
│ │ │ P │ │ P │ │ P │                   │ │
│ │ └───┘ └───┘ └───┘                   │ │
│ │  gap   gap   gap                    │ │
│ │ ┌───┐ ┌───┐ ┌───┐ ...               │ │
│ │ │ P │ │ P │ │ P │                   │ │
│ │ └───┘ └───┘ └───┘                   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 3.3 Berechnungen

```
canvasSize = containerWidth (100% Bildschirmbreite, quadratisch)
padding = 4px (entspricht p-1 = 0.25rem)
gridSize = canvasSize - 2 * padding
pixelSize = (gridSize - 15 * gap) / 16
gap = pixelGap (default: 1px, skaliert mit Canvas-Größe)
```

---

## 4. Implementierungs-Plan

### 4.1 Erledigte Arbeiten

- [x] **Analyse:** Bestehende Komponente vollständig analysiert
- [x] **Interfaces:** Alle Schnittstellen dokumentiert
- [x] **Abhängigkeiten:** TransitionEngine, BitmapProviders identifiziert

### 4.2 Erledigte Arbeiten (Implementierung)

- [x] **Canvas-Komponente erstellen**
  - [x] Canvas-Element mit ResponsiveAspect Ratio
  - [x] Pixel-Rendering-Logik implementieren
  - [x] Dirty-Checking für optimierte Updates
  - [x] Antialiasing deaktivieren
  - [x] Device Pixel Ratio Support für scharfe Darstellung

- [x] **API-Kompatibilität**
  - [x] Neue Props (bitmap, transition, refreshRate, etc.)
  - [x] Legacy Props (isRecording, audioStream)
  - [x] Transition-Integration beibehalten
  - [x] data-testid Attribute beibehalten

- [x] **Performance-Optimierungen**
  - [x] Bitmap-Vergleich für Dirty-Checking (Hash-basiert)
  - [x] Canvas-Resize-Handling (nur bei Container-Größenänderung)
  - [x] Effizientes Color-Parsing mit hexToRgb
  - [x] ResizeObserver für responsives Verhalten

- [x] **Tests**
  - [x] LED Bitmap Tests laufen erfolgreich (24/24 passed)

---

## 5. Technische Umsetzung

### 5.1 Hauptkomponente

```typescript
export function LEDPixelDisplay(props: LEDPixelDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBitmapRef = useRef<string>('');
  
  // Canvas Rendering mit Dirty-Checking
  const renderCanvas = useCallback((bitmap: LEDBitmap) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Dirty-Check: Serialisiertes Bitmap vergleichen
    const serialized = serializeBitmap(bitmap);
    if (serialized === lastBitmapRef.current) return;
    lastBitmapRef.current = serialized;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Antialiasing deaktivieren
    ctx.imageSmoothingEnabled = false;
    
    // Rendering-Logik...
  }, []);
}
```

### 5.2 Pixel-Rendering

```typescript
function renderPixels(
  ctx: CanvasRenderingContext2D,
  bitmap: LEDBitmap,
  canvasSize: number,
  pixelGap: number,
  borderRadius: number
) {
  const padding = 4;
  const gridSize = canvasSize - 2 * padding;
  const gapScaled = pixelGap * (canvasSize / 224); // Skalierter Gap
  const pixelSize = (gridSize - 15 * gapScaled) / 16;
  
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const pixel = bitmap[row][col];
      const x = padding + col * (pixelSize + gapScaled);
      const y = padding + row * (pixelSize + gapScaled);
      
      // Farbe mit Opacity anwenden
      ctx.fillStyle = applyBrightness(pixel.color, pixel.brightness ?? 1.0);
      
      // Pixel zeichnen (mit optionalem Border-Radius)
      if (borderRadius > 0) {
        drawRoundedRect(ctx, x, y, pixelSize, pixelSize, borderRadius);
      } else {
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }
}
```

### 5.3 Dirty-Checking

```typescript
function serializeBitmap(bitmap: LEDBitmap): string {
  // Schnelle Hash-Funktion für Bitmap-Vergleich
  let hash = '';
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const p = bitmap[row][col];
      hash += p.color + (p.brightness ?? 1);
    }
  }
  return hash;
}
```

---

## 6. Performance-Verbesserungen

### 6.1 Umgesetzte Optimierungen

| Optimierung | Beschreibung | Erwarteter Effekt |
|-------------|--------------|-------------------|
| Canvas statt DOM | Ein Element statt 256 | ~90% weniger DOM-Operationen |
| Dirty-Checking | Nur rendern bei Änderung | Vermeidet unnötige Redraws |
| Kein Antialiasing | `imageSmoothingEnabled=false` | Schnelleres Rendering |
| Bitmap-Hashing | Effiziente Vergleichsfunktion | O(256) statt Deep-Clone |

### 6.2 Weitere mögliche Optimierungen

| Optimierung | Beschreibung | Aufwand |
|-------------|--------------|---------|
| Web Workers | Bitmap-Berechnung im Worker | Hoch |
| OffscreenCanvas | Rendering außerhalb Main-Thread | Mittel |
| Reduced Motion | Weniger Updates bei User-Präferenz | Niedrig |
| Variable Refresh Rate | Dynamische FPS basierend auf Geräteleistung | Mittel |

---

## 7. Testbarkeit

### 7.1 Data-Attribute

Die Canvas-Komponente behält `data-testid="led-display"` für Testing bei.
Einzelne Pixel sind im Canvas nicht als DOM-Elemente zugänglich.

### 7.2 Test-Strategie

- **Unit-Tests:** Canvas-Rendering-Logik isoliert testen
- **Snapshot-Tests:** Canvas `toDataURL()` für visuelle Regression
- **Performance-Tests:** FPS-Messung bei Animation

---

## 8. Migration

### 8.1 Vorgehensweise

1. Neue Canvas-Implementierung neben alter Komponente erstellen
2. Feature-Flag für A/B-Testing (optional)
3. Nach Validierung alte Implementierung entfernen

### 8.2 Breaking Changes

**Keine:** Die API bleibt vollständig kompatibel.

---

## 9. Fazit

Der Umbau auf Canvas bietet signifikante Performance-Verbesserungen für schwächere Geräte bei voller API-Kompatibilität. Die Hauptgewinne kommen aus:

1. **Eliminierung von 256 DOM-Elementen** → Ein Canvas-Element
2. **Kein CSS-Transition-Overhead** → Direktes Pixel-Rendering
3. **Dirty-Checking** → Vermeidet unnötige Redraws
4. **Deaktiviertes Antialiasing** → Schnelleres Rendering

**Empfehlung:** Sofortige Implementierung, da der Aufwand gering und der Nutzen hoch ist.

---

**Ende des Planungsdokuments**
