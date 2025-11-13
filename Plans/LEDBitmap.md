
# LED Bitmap Display System - Konzept

**Datum:** 13. November 2025  
**Komponente:** `client/src/components/LEDPixelDisplay.tsx`  
**Ziel:** Kapselung mit sauberer Schnittstelle, Bitmap-Support und Transition-Effekte

---

## 🎯 Anforderungen

1. **Kapselung**: Klare Trennung zwischen Display-Logik und Datenquellen
2. **Bitmap-Support**: Verschiedene Bitmaps anzeigen können (Audio-Visualisierung, Icons, Animationen)
3. **Transitions**: Optionale Übergangseffekte zwischen Bitmap-Wechseln
4. **Bestehende Struktur**: Div-Grid-Struktur beibehalten (Performance, einfaches Styling)

---

## 🏗️ Architektur

### Schichten-Modell

```
┌─────────────────────────────────────────┐
│     LEDPixelDisplay (Presentation)      │  ← React Component
├─────────────────────────────────────────┤
│     LEDBitmapRenderer (Rendering)       │  ← Rendering Engine
├─────────────────────────────────────────┤
│   TransitionEngine (Optional Effects)   │  ← Transition Calculator
├─────────────────────────────────────────┤
│       Bitmap Providers (Data)           │  ← Data Sources
│  • AudioSpectrumBitmap                  │
│  • StaticBitmap                         │
│  • AnimatedBitmap                       │
│  • CustomBitmap                         │
└─────────────────────────────────────────┘
```

### Datenfluss

```
Bitmap Provider → LEDBitmapRenderer → TransitionEngine → LEDPixelDisplay
     (16x16)          (calculate)        (interpolate)      (render)
```

---

## 📦 Neue Datenstrukturen

### 1. Bitmap Type Definition

```typescript
/**
 * Represents a single LED pixel
 */
interface LEDPixel {
  color: string;      // Hex color (e.g., '#FF4500')
  brightness?: number; // Optional: 0.0 - 1.0 (default: 1.0)
}

/**
 * 16x16 Bitmap representation
 */
type LEDBitmap = LEDPixel[][];  // [row][col] = 16x16 array

/**
 * Factory function signature for dynamic bitmaps
 */
type BitmapProvider = () => LEDBitmap | Promise<LEDBitmap>;
```

### 2. Transition Configuration

```typescript
interface TransitionConfig {
  enabled: boolean;
  type: TransitionType;
  duration: number;  // milliseconds
  easing?: EasingFunction;
}

type TransitionType = 
  | 'fade'           // Crossfade between colors
  | 'slide-left'     // Slide from right to left
  | 'slide-right'    // Slide from left to right
  | 'slide-up'       // Slide from bottom to top
  | 'slide-down'     // Slide from top to bottom
  | 'dissolve'       // Random pixel-by-pixel transition
  | 'wipe-vertical'  // Vertical wipe effect
  | 'wipe-horizontal'; // Horizontal wipe effect

type EasingFunction = 
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';
```

---

## 🔧 Komponenten-Interfaces

### LEDPixelDisplay Props (Neue API)

```typescript
interface LEDPixelDisplayProps {
  // Data source
  bitmap: LEDBitmap | BitmapProvider;
  
  // Transition settings (optional)
  transition?: TransitionConfig;
  
  // Update frequency for dynamic bitmaps (ms, default: 60)
  refreshRate?: number;
  
  // Display settings
  pixelGap?: number;      // Gap between pixels in px (default: 1)
  borderRadius?: number;  // Pixel corner radius (default: 1)
  className?: string;     // Additional CSS classes
}
```

### Backward Compatibility (Audio Mode)

```typescript
/**
 * Legacy props for audio visualization mode
 * @deprecated Use bitmap prop with AudioSpectrumBitmap provider
 */
interface LEDPixelDisplayAudioProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}

// Helper to convert legacy props
function createAudioSpectrumBitmap(
  audioStream: MediaStream | null,
  isRecording: boolean
): BitmapProvider {
  // Returns the existing audio visualization logic
}
```

---

## 🎨 Bitmap Provider Implementations

### 1. AudioSpectrumBitmap (Existing Logic)

```typescript
class AudioSpectrumBitmap {
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(16).fill(0);
  
  constructor(
    private audioStream: MediaStream | null,
    private isRecording: boolean
  ) {}
  
  getBitmap(): LEDBitmap {
    // Current implementation from LEDPixelDisplay
    const bitmap: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      bitmap[row] = [];
      for (let col = 0; col < 16; col++) {
        const frequency = this.frequencyData[col];
        const threshold = ((15 - row) / 15) * 255;
        
        let color = '#000000';
        if (frequency > threshold) {
          if (row < 5) color = '#FF4500';
          else if (row < 11) color = '#FFD700';
          else color = '#FF8C00';
        }
        
        bitmap[row][col] = { color };
      }
    }
    
    return bitmap;
  }
  
  start(): void { /* Setup AudioContext */ }
  stop(): void { /* Cleanup */ }
}
```

### 2. StaticBitmap (Icons, Logos)

```typescript
class StaticBitmap {
  constructor(private pixels: LEDBitmap) {}
  
  getBitmap(): LEDBitmap {
    return this.pixels;
  }
  
  // Helper: Create from simple pattern
  static fromPattern(pattern: string[]): StaticBitmap {
    // pattern is 16 strings of 16 chars each
    // Example: '#' = active, '.' = inactive
    const bitmap: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      bitmap[row] = [];
      for (let col = 0; col < 16; col++) {
        const char = pattern[row][col];
        bitmap[row][col] = {
          color: char === '#' ? '#FF4500' : '#000000'
        };
      }
    }
    
    return new StaticBitmap(bitmap);
  }
}
```

### 3. AnimatedBitmap (Frame-based)

```typescript
class AnimatedBitmap {
  private currentFrame = 0;
  private lastUpdate = 0;
  
  constructor(
    private frames: LEDBitmap[],
    private frameRate: number = 10 // FPS
  ) {}
  
  getBitmap(): LEDBitmap {
    const now = Date.now();
    const frameDuration = 1000 / this.frameRate;
    
    if (now - this.lastUpdate >= frameDuration) {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.lastUpdate = now;
    }
    
    return this.frames[this.currentFrame];
  }
}
```

### 4. CustomBitmap (User-defined)

```typescript
type BitmapGenerator = (
  time: number,
  context?: any
) => LEDBitmap;

class CustomBitmap {
  constructor(private generator: BitmapGenerator) {}
  
  getBitmap(): LEDBitmap {
    return this.generator(Date.now());
  }
}
```

---

## 🎬 Transition Engine

### Core Implementation

```typescript
class TransitionEngine {
  private startBitmap: LEDBitmap | null = null;
  private targetBitmap: LEDBitmap | null = null;
  private startTime: number | null = null;
  private config: TransitionConfig;
  
  constructor(config: TransitionConfig) {
    this.config = config;
  }
  
  /**
   * Start transition to new bitmap
   */
  startTransition(from: LEDBitmap, to: LEDBitmap): void {
    this.startBitmap = from;
    this.targetBitmap = to;
    this.startTime = Date.now();
  }
  
  /**
   * Get current interpolated bitmap
   */
  getCurrentBitmap(): LEDBitmap {
    if (!this.config.enabled || !this.startBitmap || !this.targetBitmap) {
      return this.targetBitmap || this.createEmptyBitmap();
    }
    
    const elapsed = Date.now() - (this.startTime || 0);
    const progress = Math.min(elapsed / this.config.duration, 1.0);
    const easedProgress = this.applyEasing(progress);
    
    if (progress >= 1.0) {
      // Transition complete
      this.startBitmap = null;
      return this.targetBitmap;
    }
    
    // Interpolate based on transition type
    switch (this.config.type) {
      case 'fade':
        return this.fadeBitmaps(easedProgress);
      case 'slide-left':
        return this.slideBitmaps(easedProgress, 'left');
      // ... other types
      default:
        return this.targetBitmap;
    }
  }
  
  private fadeBitmaps(progress: number): LEDBitmap {
    const result: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        const fromPixel = this.startBitmap![row][col];
        const toPixel = this.targetBitmap![row][col];
        
        result[row][col] = {
          color: this.interpolateColor(
            fromPixel.color,
            toPixel.color,
            progress
          )
        };
      }
    }
    
    return result;
  }
  
  private slideBitmaps(progress: number, direction: string): LEDBitmap {
    const result: LEDBitmap = [];
    const offset = Math.floor(16 * progress);
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        let sourceCol = col;
        let sourceBitmap = this.startBitmap!;
        
        if (direction === 'left') {
          sourceCol = col + offset;
          if (sourceCol >= 16) {
            sourceCol -= 16;
            sourceBitmap = this.targetBitmap!;
          }
        }
        
        result[row][col] = sourceBitmap[row][sourceCol];
      }
    }
    
    return result;
  }
  
  private interpolateColor(from: string, to: string, progress: number): string {
    // Parse hex colors and interpolate RGB values
    const fromRgb = this.hexToRgb(from);
    const toRgb = this.hexToRgb(to);
    
    const r = Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * progress);
    const g = Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * progress);
    const b = Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * progress);
    
    return this.rgbToHex(r, g, b);
  }
  
  private applyEasing(t: number): number {
    switch (this.config.easing) {
      case 'ease-in': return t * t;
      case 'ease-out': return t * (2 - t);
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t; // linear
    }
  }
  
  private createEmptyBitmap(): LEDBitmap {
    return Array(16).fill(null).map(() => 
      Array(16).fill(null).map(() => ({ color: '#000000' }))
    );
  }
  
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
  
  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
}
```

---

## 🔨 Neue LEDPixelDisplay Komponente

### Struktur bleibt erhalten

```typescript
export function LEDPixelDisplay({
  bitmap,
  transition = { enabled: false, type: 'fade', duration: 300 },
  refreshRate = 60,
  pixelGap = 1,
  borderRadius = 1,
  className = ''
}: LEDPixelDisplayProps) {
  const [currentBitmap, setCurrentBitmap] = useState<LEDBitmap>(createEmptyBitmap());
  const transitionEngineRef = useRef(new TransitionEngine(transition));
  const animationFrameRef = useRef<number>();
  
  // Update bitmap from provider
  useEffect(() => {
    let isActive = true;
    
    const updateBitmap = async () => {
      if (!isActive) return;
      
      // Get new bitmap (sync or async)
      const newBitmap = typeof bitmap === 'function' 
        ? await bitmap() 
        : bitmap;
      
      // Start transition if enabled
      if (transition.enabled) {
        transitionEngineRef.current.startTransition(currentBitmap, newBitmap);
      } else {
        setCurrentBitmap(newBitmap);
      }
      
      // Schedule next update for dynamic sources
      if (typeof bitmap === 'function') {
        setTimeout(() => updateBitmap(), 1000 / refreshRate);
      }
    };
    
    updateBitmap();
    
    return () => {
      isActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [bitmap, refreshRate, transition.enabled]);
  
  // Animation loop for transitions
  useEffect(() => {
    if (!transition.enabled) return;
    
    const animate = () => {
      const interpolatedBitmap = transitionEngineRef.current.getCurrentBitmap();
      setCurrentBitmap(interpolatedBitmap);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [transition.enabled]);
  
  // Render pixels (SAME STRUCTURE AS BEFORE)
  const pixels = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const pixel = currentBitmap[row][col];
      
      pixels.push(
        <div
          key={`${row}-${col}`}
          className="rounded-sm transition-colors duration-75"
          style={{ 
            backgroundColor: pixel.color,
            borderRadius: `${borderRadius}px`,
            opacity: pixel.brightness ?? 1.0
          }}
          data-testid={`led-pixel-${row}-${col}`}
        />
      );
    }
  }
  
  return (
    <div 
      className={`w-full aspect-square max-w-[224px] mx-auto p-1 bg-black rounded-md ${className}`}
      data-testid="led-display"
    >
      <div 
        className="grid grid-cols-16 grid-rows-16 w-full h-full"
        style={{ gap: `${pixelGap}px` }}
      >
        {pixels}
      </div>
    </div>
  );
}
```

---

## 💡 Verwendungsbeispiele

### 1. Audio Visualisierung (aktueller Use-Case)

```typescript
// In home.tsx
const audioProvider = useMemo(() => {
  const spectrum = new AudioSpectrumBitmap(audioStream, isRecording);
  if (isRecording) spectrum.start();
  return () => spectrum.getBitmap();
}, [audioStream, isRecording]);

<LEDPixelDisplay 
  bitmap={audioProvider}
  refreshRate={60}
/>
```

### 2. Statisches Icon anzeigen

```typescript
const micIcon = StaticBitmap.fromPattern([
  '................',
  '.....######.....',
  '.....#....#.....',
  '.....#....#.....',
  '.....#....#.....',
  '.....######.....',
  '.......##.......',
  '.......##.......',
  '....########....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
]);

<LEDPixelDisplay 
  bitmap={micIcon.getBitmap()}
/>
```

### 3. Wechsel mit Transition

```typescript
const [currentBitmap, setCurrentBitmap] = useState(idleBitmap);

// Beim Start der Aufnahme
setCurrentBitmap(audioProvider);

<LEDPixelDisplay 
  bitmap={currentBitmap}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 500,
    easing: 'ease-out'
  }}
/>
```

### 4. Animation (Pulsierende Aufnahme-Anzeige)

```typescript
const recordingAnimation = new AnimatedBitmap([
  redCircleBitmap,
  darkerRedCircleBitmap,
  darkestRedCircleBitmap,
  darkerRedCircleBitmap
], 2); // 2 FPS

<LEDPixelDisplay 
  bitmap={() => recordingAnimation.getBitmap()}
  refreshRate={2}
/>
```

---

## 🎯 Migration Path

### Phase 1: Refactoring (keine Breaking Changes)
1. Neue Typen/Klassen in separatem File erstellen (`lib/ledBitmap.ts`)
2. TransitionEngine implementieren
3. Bitmap Provider Klassen implementieren

### Phase 2: Component Update
1. Neue Props hinzufügen (optional, backward compatible)
2. Legacy Props als deprecated markieren
3. Interne Logik umbauen, aber alte API noch unterstützen

### Phase 3: Migration
1. `home.tsx` auf neue API umstellen
2. Tests aktualisieren
3. Dokumentation erweitern

### Phase 4: Cleanup
1. Deprecated Props entfernen (Breaking Change, Major Version)

---

## ✅ Vorteile dieser Architektur

1. **Separation of Concerns**: Display-Logik getrennt von Datenquellen
2. **Wiederverwendbarkeit**: Bitmap-Provider können überall genutzt werden
3. **Testbarkeit**: Jede Komponente einzeln testbar
4. **Erweiterbarkeit**: Neue Provider/Transitions einfach hinzufügbar
5. **Performance**: Div-Struktur bleibt (kein Canvas overhead)
6. **Backward Compatible**: Alte API kann weiter funktionieren

---

## 📁 Dateistruktur

```
client/src/lib/
├── ledBitmap/
│   ├── index.ts                    # Public API exports
│   ├── types.ts                    # Type definitions
│   ├── TransitionEngine.ts         # Transition logic
│   ├── providers/
│   │   ├── AudioSpectrumBitmap.ts
│   │   ├── StaticBitmap.ts
│   │   ├── AnimatedBitmap.ts
│   │   └── CustomBitmap.ts
│   └── utils/
│       ├── colorUtils.ts           # Color interpolation
│       └── bitmapUtils.ts          # Helper functions
```

---

## 🚀 Nächste Schritte

1. **Typ-Definitionen** in `types.ts` erstellen
2. **TransitionEngine** implementieren (Start mit 'fade')
3. **AudioSpectrumBitmap** aus bestehendem Code extrahieren
4. **LEDPixelDisplay** Component refactoren
5. **Unit Tests** schreiben
6. **Beispiel-Bitmaps** für Icons erstellen (Mic, Stop, etc.)
7. **Dokumentation** mit Verwendungsbeispielen erweitern
