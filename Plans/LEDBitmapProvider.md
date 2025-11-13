
# LED Bitmap Provider - PNG Support Konzept

**Datum:** 13. November 2025  
**Feature:** PNG-Bilder als Bitmap-Quelle für LEDPixelDisplay  
**Ziel:** 16x16 PNG-Dateien direkt als Display-Inhalte verwenden

---

## 🎯 Anforderung

Das LEDPixelDisplay soll 16x16 PNG-Bilder als Input akzeptieren können, um:
- Icons und Symbole anzuzeigen (Mikrofon, Stop, Pause, etc.)
- Statische Grafiken darzustellen
- Asset-basierte Animationen zu ermöglichen
- Design-Tools zur Bitmap-Erstellung zu nutzen

---

## 🏗️ Architektur-Integration

```
PNG File (16x16)
    ↓
ImageBitmapProvider
    ↓
Canvas API → getImageData()
    ↓
Pixel RGB Array
    ↓
Color Mapping → LEDBitmap
    ↓
LEDPixelDisplay
```

---

## 📦 Neue Provider-Klasse: `ImageBitmapProvider`

### Interface Definition

```typescript
interface ImageBitmapProviderOptions {
  // Source
  imageUrl: string | HTMLImageElement;
  
  // Color mapping strategy
  colorMode?: 'full' | 'threshold' | 'palette' | 'monochrome';
  
  // Threshold mode settings
  threshold?: number; // 0-255, default: 128
  onColor?: string;   // Active pixel color (default: '#FF4500')
  offColor?: string;  // Inactive pixel color (default: '#000000')
  
  // Palette mode settings
  palette?: LEDPalette;
  
  // Brightness adjustment
  brightness?: number; // 0.0 - 1.0, default: 1.0
  
  // Caching
  cache?: boolean; // Default: true
}

interface LEDPalette {
  [key: string]: string; // Color name → hex color
  // Example: { 'red': '#FF0000', 'green': '#00FF00', ... }
}
```

### Implementation

```typescript
class ImageBitmapProvider {
  private bitmap: LEDBitmap | null = null;
  private image: HTMLImageElement | null = null;
  private options: Required<ImageBitmapProviderOptions>;
  
  constructor(options: ImageBitmapProviderOptions) {
    this.options = {
      imageUrl: options.imageUrl,
      colorMode: options.colorMode || 'full',
      threshold: options.threshold || 128,
      onColor: options.onColor || '#FF4500',
      offColor: options.offColor || '#000000',
      palette: options.palette || {},
      brightness: options.brightness || 1.0,
      cache: options.cache ?? true
    };
  }
  
  /**
   * Load image and convert to LED bitmap
   */
  async load(): Promise<void> {
    // Load image
    this.image = await this.loadImage(this.options.imageUrl);
    
    // Convert to bitmap
    this.bitmap = await this.imageToLEDBitmap(this.image);
  }
  
  /**
   * Get current bitmap (synchronous after load)
   */
  getBitmap(): LEDBitmap {
    if (!this.bitmap) {
      throw new Error('ImageBitmapProvider: Call load() before getBitmap()');
    }
    return this.bitmap;
  }
  
  /**
   * Load image from URL or use existing HTMLImageElement
   */
  private loadImage(source: string | HTMLImageElement): Promise<HTMLImageElement> {
    if (typeof source !== 'string') {
      return Promise.resolve(source);
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Enable CORS for canvas
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${source}`));
      img.src = source;
    });
  }
  
  /**
   * Convert image to 16x16 LED bitmap using Canvas API
   */
  private async imageToLEDBitmap(image: HTMLImageElement): Promise<LEDBitmap> {
    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Draw image scaled to 16x16
    ctx.imageSmoothingEnabled = false; // Pixel-perfect scaling
    ctx.drawImage(image, 0, 0, 16, 16);
    
    // Extract pixel data
    const imageData = ctx.getImageData(0, 0, 16, 16);
    const pixels = imageData.data; // RGBA array
    
    // Convert to LED bitmap based on color mode
    const bitmap: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      bitmap[row] = [];
      for (let col = 0; col < 16; col++) {
        const idx = (row * 16 + col) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const a = pixels[idx + 3];
        
        bitmap[row][col] = this.rgbaToLEDPixel(r, g, b, a);
      }
    }
    
    return bitmap;
  }
  
  /**
   * Convert RGBA values to LED pixel based on color mode
   */
  private rgbaToLEDPixel(r: number, g: number, b: number, a: number): LEDPixel {
    // Handle transparency
    if (a < 128) {
      return { color: this.options.offColor, brightness: 0 };
    }
    
    switch (this.options.colorMode) {
      case 'threshold':
        return this.thresholdMode(r, g, b, a);
      
      case 'palette':
        return this.paletteMode(r, g, b, a);
      
      case 'monochrome':
        return this.monochromeMode(r, g, b, a);
      
      case 'full':
      default:
        return this.fullColorMode(r, g, b, a);
    }
  }
  
  /**
   * Full color mode: Use exact RGB colors
   */
  private fullColorMode(r: number, g: number, b: number, a: number): LEDPixel {
    const color = this.rgbToHex(r, g, b);
    const brightness = (a / 255) * this.options.brightness;
    return { color, brightness };
  }
  
  /**
   * Threshold mode: Binary on/off based on brightness
   */
  private thresholdMode(r: number, g: number, b: number, a: number): LEDPixel {
    const brightness = (r + g + b) / 3;
    const isOn = brightness > this.options.threshold;
    
    return {
      color: isOn ? this.options.onColor : this.options.offColor,
      brightness: (a / 255) * this.options.brightness
    };
  }
  
  /**
   * Palette mode: Map to nearest color in palette
   */
  private paletteMode(r: number, g: number, b: number, a: number): LEDPixel {
    const inputColor = { r, g, b };
    let nearestColor = this.options.offColor;
    let minDistance = Infinity;
    
    // Find nearest palette color
    for (const hexColor of Object.values(this.options.palette)) {
      const paletteRgb = this.hexToRgb(hexColor);
      const distance = this.colorDistance(inputColor, paletteRgb);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestColor = hexColor;
      }
    }
    
    return {
      color: nearestColor,
      brightness: (a / 255) * this.options.brightness
    };
  }
  
  /**
   * Monochrome mode: Single color with brightness variation
   */
  private monochromeMode(r: number, g: number, b: number, a: number): LEDPixel {
    const brightness = ((r + g + b) / 3 / 255) * (a / 255) * this.options.brightness;
    
    return {
      color: this.options.onColor,
      brightness
    };
  }
  
  /**
   * Calculate Euclidean distance between two colors
   */
  private colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }
  
  /**
   * Convert RGB to hex
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }
  
  /**
   * Convert hex to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }
}
```

---

## 🎨 Verwendungsbeispiele

### 1. Einfaches Icon (Threshold Mode)

```typescript
// Mikrofon-Icon aus PNG laden
const micIcon = new ImageBitmapProvider({
  imageUrl: '/assets/icons/microphone-16x16.png',
  colorMode: 'threshold',
  threshold: 128,
  onColor: '#FF4500',
  offColor: '#000000'
});

await micIcon.load();

<LEDPixelDisplay 
  bitmap={micIcon.getBitmap()}
/>
```

### 2. Farbiges Logo (Full Color Mode)

```typescript
const logo = new ImageBitmapProvider({
  imageUrl: '/assets/logo-16x16.png',
  colorMode: 'full',
  brightness: 0.8
});

await logo.load();

<LEDPixelDisplay 
  bitmap={logo.getBitmap()}
/>
```

### 3. Palette-basiertes Icon (LED-optimiert)

```typescript
// Definiere Farbpalette wie im aktuellen Audio-Display
const ledPalette: LEDPalette = {
  'high': '#FF4500',    // Hohe Frequenzen - Rot
  'mid': '#FFD700',     // Mittlere Frequenzen - Gelb
  'low': '#FF8C00',     // Niedrige Frequenzen - Orange
  'off': '#000000'      // Aus
};

const statusIcon = new ImageBitmapProvider({
  imageUrl: '/assets/icons/recording-16x16.png',
  colorMode: 'palette',
  palette: ledPalette
});

await statusIcon.load();

<LEDPixelDisplay 
  bitmap={statusIcon.getBitmap()}
/>
```

### 4. Animation aus PNG-Frames

```typescript
// Lade mehrere Frames
const frames = await Promise.all([
  new ImageBitmapProvider({ imageUrl: '/assets/anim/frame-0.png' }).load(),
  new ImageBitmapProvider({ imageUrl: '/assets/anim/frame-1.png' }).load(),
  new ImageBitmapProvider({ imageUrl: '/assets/anim/frame-2.png' }).load()
]);

// Nutze AnimatedBitmap
const animation = new AnimatedBitmap(
  frames.map(f => f.getBitmap()),
  5 // 5 FPS
);

<LEDPixelDisplay 
  bitmap={() => animation.getBitmap()}
  refreshRate={5}
/>
```

### 5. Dynamisches Wechseln mit Transition

```typescript
const [currentIcon, setCurrentIcon] = useState<ImageBitmapProvider>();

// Initial: Idle Icon
useEffect(() => {
  const idleIcon = new ImageBitmapProvider({
    imageUrl: '/assets/icons/idle-16x16.png',
    colorMode: 'threshold',
    onColor: '#666666'
  });
  idleIcon.load().then(() => setCurrentIcon(idleIcon));
}, []);

// Bei Aufnahmestart: Wechsel zu Recording Icon
const startRecording = async () => {
  const recIcon = new ImageBitmapProvider({
    imageUrl: '/assets/icons/recording-16x16.png',
    colorMode: 'palette',
    palette: ledPalette
  });
  await recIcon.load();
  setCurrentIcon(recIcon);
};

<LEDPixelDisplay 
  bitmap={currentIcon?.getBitmap() || createEmptyBitmap()}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 400,
    easing: 'ease-out'
  }}
/>
```

---

## 🎨 PNG Design Guidelines

### Optimale PNG-Spezifikationen

- **Auflösung:** Exakt 16x16 Pixel
- **Farbmodus:** RGB oder RGBA (für Transparenz)
- **Format:** PNG-8 oder PNG-24
- **Dateigröße:** < 1 KB (typisch 200-500 Bytes)

### Design-Tools

**Empfohlene Tools:**
1. **Aseprite** - Pixel Art Editor (optimal für 16x16)
2. **Piskel** - Online Pixel Art Tool
3. **Photoshop/GIMP** - Mit Pixel Grid aktiviert
4. **Figma** - Mit 1px Grid und Export-Skalierung

**Export-Einstellungen:**
- Keine Interpolation/Smoothing
- Nearest-Neighbor Skalierung
- Transparenter Hintergrund wenn gewünscht

### Icon-Bibliothek Struktur

```
public/assets/icons/
├── microphone-16x16.png      # Mikrofon (Idle)
├── recording-16x16.png        # Aufnahme läuft (animiert rot)
├── processing-16x16.png       # Verarbeitung (animiert gelb)
├── success-16x16.png          # Erfolg (grünes Häkchen)
├── error-16x16.png            # Fehler (rotes X)
├── paused-16x16.png           # Pause (zwei Balken)
└── stopped-16x16.png          # Stop (Quadrat)
```

---

## 🛠️ React Hook für PNG-Bitmap Loading

```typescript
/**
 * Custom hook für einfaches Laden von PNG-Bitmaps
 */
function useImageBitmap(
  imageUrl: string,
  options?: Partial<ImageBitmapProviderOptions>
) {
  const [bitmap, setBitmap] = useState<LEDBitmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    
    const loadBitmap = async () => {
      try {
        setLoading(true);
        const provider = new ImageBitmapProvider({
          imageUrl,
          ...options
        });
        
        await provider.load();
        
        if (!cancelled) {
          setBitmap(provider.getBitmap());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load bitmap'));
          setBitmap(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadBitmap();
    
    return () => {
      cancelled = true;
    };
  }, [imageUrl, JSON.stringify(options)]);
  
  return { bitmap, loading, error };
}

// Verwendung:
function MyComponent() {
  const { bitmap, loading } = useImageBitmap('/assets/icons/mic-16x16.png', {
    colorMode: 'threshold',
    onColor: '#FF4500'
  });
  
  if (loading) return <div>Loading...</div>;
  
  return <LEDPixelDisplay bitmap={bitmap!} />;
}
```

---

## 🚀 Preload-Strategie für schnelle Wechsel

```typescript
/**
 * Preload-Manager für häufig verwendete Icons
 */
class BitmapPreloader {
  private cache = new Map<string, LEDBitmap>();
  
  async preload(configs: Array<{ key: string; url: string; options?: ImageBitmapProviderOptions }>) {
    const promises = configs.map(async ({ key, url, options }) => {
      const provider = new ImageBitmapProvider({ imageUrl: url, ...options });
      await provider.load();
      this.cache.set(key, provider.getBitmap());
    });
    
    await Promise.all(promises);
  }
  
  get(key: string): LEDBitmap | undefined {
    return this.cache.get(key);
  }
  
  has(key: string): boolean {
    return this.cache.has(key);
  }
}

// App-Initialisierung
const bitmapPreloader = new BitmapPreloader();

await bitmapPreloader.preload([
  { key: 'idle', url: '/assets/icons/idle-16x16.png', options: { colorMode: 'threshold' } },
  { key: 'recording', url: '/assets/icons/recording-16x16.png', options: { colorMode: 'palette', palette: ledPalette } },
  { key: 'processing', url: '/assets/icons/processing-16x16.png', options: { colorMode: 'full' } },
  { key: 'success', url: '/assets/icons/success-16x16.png', options: { colorMode: 'threshold', onColor: '#00FF00' } }
]);

// Sofortiger Zugriff ohne Ladezeit
const recordingBitmap = bitmapPreloader.get('recording')!;
```

---

## 📁 Dateistruktur

```
client/src/lib/ledBitmap/
├── providers/
│   ├── ImageBitmapProvider.ts     # PNG → LEDBitmap Konverter
│   ├── AudioSpectrumBitmap.ts
│   ├── StaticBitmap.ts
│   └── AnimatedBitmap.ts
├── hooks/
│   ├── useImageBitmap.ts          # React Hook für PNG-Loading
│   └── useBitmapPreloader.ts      # React Hook für Preloading
├── utils/
│   └── BitmapPreloader.ts         # Cache-Manager
└── index.ts

public/assets/icons/
├── idle-16x16.png
├── recording-16x16.png
├── processing-16x16.png
├── success-16x16.png
└── error-16x16.png
```

---

## 🎯 Integration in bestehende App (home.tsx)

```typescript
// In home.tsx
const bitmapPreloader = useMemo(() => new BitmapPreloader(), []);

// Preload beim App-Start
useEffect(() => {
  bitmapPreloader.preload([
    { key: 'idle', url: '/assets/icons/idle-16x16.png', options: { colorMode: 'threshold', onColor: '#666666' } },
    { key: 'recording', url: '/assets/icons/recording-16x16.png', options: { colorMode: 'palette', palette: ledPalette } }
  ]);
}, []);

// Aktuelles Bitmap basierend auf Recording-Status
const currentBitmap = useMemo(() => {
  if (isRecording && audioStream) {
    // Audio-Visualisierung
    return audioSpectrumProvider.getBitmap();
  } else {
    // Idle Icon aus PNG
    return bitmapPreloader.get('idle') || createEmptyBitmap();
  }
}, [isRecording, audioStream]);

<LEDPixelDisplay 
  bitmap={currentBitmap}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 300
  }}
/>
```

---

## ✅ Vorteile dieser Lösung

1. **Designer-Friendly**: PNG-Dateien können mit Standard-Tools erstellt werden
2. **Flexibilität**: Verschiedene Color-Modes für unterschiedliche Use-Cases
3. **Performance**: Canvas API ist sehr schnell, Caching verhindert Re-Processing
4. **Wiederverwendbarkeit**: Einmal geladene Bitmaps können mehrfach verwendet werden
5. **Transitions**: Nahtlos mit bestehender Transition-Engine kompatibel
6. **Asset-basiert**: Einfache Integration in Build-Pipeline und Versionskontrolle

---

## 🚀 Nächste Schritte

1. `ImageBitmapProvider` Klasse implementieren
2. `useImageBitmap` Hook erstellen
3. `BitmapPreloader` für App-Initialisierung implementieren
4. Beispiel-Icons in Aseprite erstellen (16x16)
5. Integration in `home.tsx` testen
6. Dokumentation mit Beispiel-PNGs erweitern
