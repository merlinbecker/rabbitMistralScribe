
# LED Animated Bitmap - Konzept für Animationen

**Datum:** 13. November 2025  
**Feature:** Animierte Bitmaps für LEDPixelDisplay  
**Ziel:** Frame-basierte und prozedurale Animationen auf dem 16x16 LED-Display

---

## 🎯 Anforderung

Das LEDPixelDisplay soll verschiedene Arten von Animationen darstellen können:
- **Frame-basierte Animationen** (Sprite-Sheets, PNG-Sequenzen)
- **Prozedurale Animationen** (Ladebalken, Pulse-Effekte, Wellen)
- **Zyklische Animationen** (Loop, Ping-Pong, One-Shot)
- **Timing-Kontrolle** (FPS, Delays, Synchronisation)
- **Animation-Events** (onComplete, onLoop, onFrame)

---

## 🏗️ Architektur-Überblick

```
┌─────────────────────────────────────────────┐
│         Animation Sources                   │
├─────────────────────────────────────────────┤
│  • Frame Sequence (PNG/Manual)              │
│  • Procedural Generator                     │
│  • Sprite Sheet                             │
│  • Programmatic Timeline                    │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│      AnimatedBitmapController               │
├─────────────────────────────────────────────┤
│  • Frame Management                         │
│  • Timing Control                           │
│  • Loop Modes                               │
│  • State Machine                            │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│         LEDPixelDisplay                     │
└─────────────────────────────────────────────┘
```

---

## 📦 Core Types & Interfaces

### Animation Configuration

```typescript
/**
 * Animation playback modes
 */
type AnimationMode = 
  | 'loop'        // Continuous loop: 1→2→3→1→2→3...
  | 'ping-pong'   // Back and forth: 1→2→3→2→1→2→3...
  | 'once'        // Play once and stop: 1→2→3 [STOP]
  | 'manual';     // External frame control

/**
 * Animation timing configuration
 */
interface AnimationTiming {
  fps: number;              // Frames per second (default: 10)
  delay?: number;           // Initial delay in ms before start
  frameDurations?: number[]; // Custom duration per frame in ms
  startFrame?: number;      // Start at specific frame (default: 0)
}

/**
 * Animation event callbacks
 */
interface AnimationCallbacks {
  onStart?: () => void;
  onFrame?: (frameIndex: number) => void;
  onLoop?: (loopCount: number) => void;
  onComplete?: () => void;
  onStop?: () => void;
}

/**
 * Complete animation configuration
 */
interface AnimationConfig {
  mode: AnimationMode;
  timing: AnimationTiming;
  callbacks?: AnimationCallbacks;
  autoStart?: boolean; // Start immediately (default: true)
}
```

---

## 🎬 AnimatedBitmapController - Hauptklasse

```typescript
class AnimatedBitmapController {
  private frames: LEDBitmap[] = [];
  private currentFrameIndex: number = 0;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private loopCount: number = 0;
  private direction: 1 | -1 = 1; // For ping-pong mode
  
  private lastFrameTime: number = 0;
  private animationFrameId: number | null = null;
  
  constructor(
    frames: LEDBitmap[],
    private config: AnimationConfig
  ) {
    if (frames.length === 0) {
      throw new Error('AnimatedBitmapController requires at least one frame');
    }
    
    this.frames = frames;
    this.currentFrameIndex = config.timing.startFrame || 0;
    
    if (config.autoStart !== false) {
      this.start();
    }
  }
  
  /**
   * Start animation playback
   */
  start(): void {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    
    if (this.config.callbacks?.onStart) {
      this.config.callbacks.onStart();
    }
    
    // Apply initial delay if configured
    if (this.config.timing.delay) {
      setTimeout(() => this.animate(), this.config.timing.delay);
    } else {
      this.animate();
    }
  }
  
  /**
   * Pause animation
   */
  pause(): void {
    this.isPaused = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Resume paused animation
   */
  resume(): void {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.animate();
  }
  
  /**
   * Stop animation and reset to start
   */
  stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentFrameIndex = this.config.timing.startFrame || 0;
    this.loopCount = 0;
    this.direction = 1;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.config.callbacks?.onStop) {
      this.config.callbacks.onStop();
    }
  }
  
  /**
   * Get current frame bitmap
   */
  getCurrentBitmap(): LEDBitmap {
    return this.frames[this.currentFrameIndex];
  }
  
  /**
   * Manually set frame (for 'manual' mode)
   */
  setFrame(index: number): void {
    if (index < 0 || index >= this.frames.length) {
      throw new Error(`Frame index ${index} out of bounds (0-${this.frames.length - 1})`);
    }
    
    this.currentFrameIndex = index;
    
    if (this.config.callbacks?.onFrame) {
      this.config.callbacks.onFrame(index);
    }
  }
  
  /**
   * Get animation state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentFrame: this.currentFrameIndex,
      totalFrames: this.frames.length,
      loopCount: this.loopCount,
      progress: this.currentFrameIndex / (this.frames.length - 1)
    };
  }
  
  /**
   * Main animation loop
   */
  private animate = (): void => {
    if (!this.isPlaying || this.isPaused) return;
    
    const now = performance.now();
    const frameDuration = this.getFrameDuration();
    const elapsed = now - this.lastFrameTime;
    
    if (elapsed >= frameDuration) {
      this.lastFrameTime = now;
      this.advanceFrame();
      
      if (this.config.callbacks?.onFrame) {
        this.config.callbacks.onFrame(this.currentFrameIndex);
      }
    }
    
    this.animationFrameId = requestAnimationFrame(this.animate);
  }
  
  /**
   * Get duration for current frame
   */
  private getFrameDuration(): number {
    if (this.config.timing.frameDurations) {
      return this.config.timing.frameDurations[this.currentFrameIndex] || 
             (1000 / this.config.timing.fps);
    }
    return 1000 / this.config.timing.fps;
  }
  
  /**
   * Advance to next frame based on mode
   */
  private advanceFrame(): void {
    switch (this.config.mode) {
      case 'loop':
        this.advanceLoop();
        break;
      
      case 'ping-pong':
        this.advancePingPong();
        break;
      
      case 'once':
        this.advanceOnce();
        break;
      
      case 'manual':
        // No automatic advancement
        break;
    }
  }
  
  private advanceLoop(): void {
    this.currentFrameIndex++;
    
    if (this.currentFrameIndex >= this.frames.length) {
      this.currentFrameIndex = 0;
      this.loopCount++;
      
      if (this.config.callbacks?.onLoop) {
        this.config.callbacks.onLoop(this.loopCount);
      }
    }
  }
  
  private advancePingPong(): void {
    this.currentFrameIndex += this.direction;
    
    // Reached end, reverse direction
    if (this.currentFrameIndex >= this.frames.length - 1) {
      this.direction = -1;
      this.currentFrameIndex = this.frames.length - 1;
      this.loopCount++;
      
      if (this.config.callbacks?.onLoop) {
        this.config.callbacks.onLoop(this.loopCount);
      }
    }
    // Reached start, reverse direction
    else if (this.currentFrameIndex <= 0) {
      this.direction = 1;
      this.currentFrameIndex = 0;
    }
  }
  
  private advanceOnce(): void {
    if (this.currentFrameIndex < this.frames.length - 1) {
      this.currentFrameIndex++;
    } else {
      // Animation complete
      this.stop();
      
      if (this.config.callbacks?.onComplete) {
        this.config.callbacks.onComplete();
      }
    }
  }
}
```

---

## 🎨 Animation Builders - Convenience Factories

### 1. Frame Sequence Animation

```typescript
/**
 * Create animation from array of bitmaps
 */
function createFrameAnimation(
  frames: LEDBitmap[],
  fps: number = 10,
  mode: AnimationMode = 'loop'
): AnimatedBitmapController {
  return new AnimatedBitmapController(frames, {
    mode,
    timing: { fps },
    autoStart: true
  });
}
```

### 2. PNG Sequence Animation

```typescript
/**
 * Load animation from PNG files
 */
async function createPNGAnimation(
  urls: string[],
  options: {
    fps?: number;
    mode?: AnimationMode;
    colorMode?: 'threshold' | 'palette' | 'full';
    onColor?: string;
  } = {}
): Promise<AnimatedBitmapController> {
  // Load all frames
  const framePromises = urls.map(url => {
    const provider = new ImageBitmapProvider({
      imageUrl: url,
      colorMode: options.colorMode || 'threshold',
      onColor: options.onColor || '#FF4500'
    });
    return provider.load().then(() => provider.getBitmap());
  });
  
  const frames = await Promise.all(framePromises);
  
  return new AnimatedBitmapController(frames, {
    mode: options.mode || 'loop',
    timing: { fps: options.fps || 10 },
    autoStart: true
  });
}
```

### 3. Sprite Sheet Animation

```typescript
/**
 * Extract frames from sprite sheet
 */
async function createSpriteSheetAnimation(
  spriteSheetUrl: string,
  config: {
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    framesPerRow: number;
    fps?: number;
    mode?: AnimationMode;
  }
): Promise<AnimatedBitmapController> {
  // Load sprite sheet
  const img = await loadImage(spriteSheetUrl);
  
  // Extract individual frames
  const frames: LEDBitmap[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  
  for (let i = 0; i < config.frameCount; i++) {
    const col = i % config.framesPerRow;
    const row = Math.floor(i / config.framesPerRow);
    
    const sx = col * config.frameWidth;
    const sy = row * config.frameHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, 16, 16);
    
    // Draw frame scaled to 16x16
    ctx.drawImage(
      img,
      sx, sy, config.frameWidth, config.frameHeight,
      0, 0, 16, 16
    );
    
    // Convert to bitmap
    const imageData = ctx.getImageData(0, 0, 16, 16);
    const bitmap = imageDataToLEDBitmap(imageData);
    frames.push(bitmap);
  }
  
  return new AnimatedBitmapController(frames, {
    mode: config.mode || 'loop',
    timing: { fps: config.fps || 10 },
    autoStart: true
  });
}
```

---

## 🌊 Procedural Animations - Generators

### Loading Spinner

```typescript
/**
 * Circular loading spinner animation
 */
function createLoadingSpinner(
  color: string = '#FF4500',
  fps: number = 15
): AnimatedBitmapController {
  const frames: LEDBitmap[] = [];
  const centerX = 7.5;
  const centerY = 7.5;
  const radius = 6;
  const segments = 12; // Number of animation frames
  
  for (let frame = 0; frame < segments; frame++) {
    const bitmap: LEDBitmap = createEmptyBitmap();
    
    // Draw rotating arc
    for (let i = 0; i < 8; i++) {
      const angle = (frame + i) * (Math.PI * 2 / segments);
      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * radius);
      
      if (x >= 0 && x < 16 && y >= 0 && y < 16) {
        const brightness = 1 - (i / 8); // Fade trail
        bitmap[y][x] = { color, brightness };
      }
    }
    
    frames.push(bitmap);
  }
  
  return new AnimatedBitmapController(frames, {
    mode: 'loop',
    timing: { fps },
    autoStart: true
  });
}
```

### Progress Bar

```typescript
/**
 * Horizontal progress bar animation
 */
function createProgressBar(
  progress: number, // 0.0 - 1.0
  color: string = '#FFD700'
): LEDBitmap {
  const bitmap: LEDBitmap = createEmptyBitmap();
  const barWidth = Math.floor(progress * 16);
  
  // Draw progress bar (centered vertically)
  for (let row = 6; row <= 9; row++) {
    for (let col = 0; col < barWidth; col++) {
      bitmap[row][col] = { color };
    }
  }
  
  return bitmap;
}

/**
 * Animated progress bar (0 to 100%)
 */
function createProgressBarAnimation(
  duration: number = 3000, // ms
  color: string = '#FFD700'
): AnimatedBitmapController {
  const frames: LEDBitmap[] = [];
  const frameCount = 30;
  
  for (let i = 0; i <= frameCount; i++) {
    const progress = i / frameCount;
    frames.push(createProgressBar(progress, color));
  }
  
  return new AnimatedBitmapController(frames, {
    mode: 'once',
    timing: { fps: frameCount / (duration / 1000) },
    autoStart: true
  });
}
```

### Pulse Effect

```typescript
/**
 * Pulsing circle animation
 */
function createPulseAnimation(
  color: string = '#FF4500',
  fps: number = 20
): AnimatedBitmapController {
  const frames: LEDBitmap[] = [];
  const frameCount = 20;
  const centerX = 7.5;
  const centerY = 7.5;
  
  for (let frame = 0; frame < frameCount; frame++) {
    const bitmap: LEDBitmap = createEmptyBitmap();
    const t = frame / frameCount;
    
    // Ease-in-out
    const eased = t < 0.5 
      ? 2 * t * t 
      : -1 + (4 - 2 * t) * t;
    
    const radius = 2 + eased * 5; // Radius from 2 to 7
    const brightness = 1 - eased * 0.5; // Fade out as it grows
    
    // Draw circle
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 16; col++) {
        const dx = col - centerX;
        const dy = row - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (Math.abs(distance - radius) < 1) {
          bitmap[row][col] = { color, brightness };
        }
      }
    }
    
    frames.push(bitmap);
  }
  
  return new AnimatedBitmapController(frames, {
    mode: 'loop',
    timing: { fps },
    autoStart: true
  });
}
```

### Wave Effect

```typescript
/**
 * Horizontal wave animation
 */
function createWaveAnimation(
  color: string = '#00BFFF',
  fps: number = 15
): AnimatedBitmapController {
  const frames: LEDBitmap[] = [];
  const frameCount = 16;
  
  for (let frame = 0; frame < frameCount; frame++) {
    const bitmap: LEDBitmap = createEmptyBitmap();
    
    for (let col = 0; col < 16; col++) {
      // Sine wave formula
      const angle = ((col + frame) / 16) * Math.PI * 2;
      const amplitude = 3;
      const offset = 8;
      const row = Math.round(offset + Math.sin(angle) * amplitude);
      
      // Draw wave point and neighbors for thickness
      for (let r = row - 1; r <= row + 1; r++) {
        if (r >= 0 && r < 16) {
          const dist = Math.abs(r - row);
          const brightness = 1 - (dist * 0.5);
          bitmap[r][col] = { color, brightness };
        }
      }
    }
    
    frames.push(bitmap);
  }
  
  return new AnimatedBitmapController(frames, {
    mode: 'loop',
    timing: { fps },
    autoStart: true
  });
}
```

### Matrix Rain Effect

```typescript
/**
 * Matrix-style falling characters
 */
function createMatrixRainAnimation(
  color: string = '#00FF00',
  fps: number = 10
): AnimatedBitmapController {
  const frames: LEDBitmap[] = [];
  const frameCount = 32;
  const numColumns = 16;
  
  // Random column speeds and offsets
  const columns = Array.from({ length: numColumns }, () => ({
    speed: 1 + Math.random() * 2,
    offset: Math.random() * 16
  }));
  
  for (let frame = 0; frame < frameCount; frame++) {
    const bitmap: LEDBitmap = createEmptyBitmap();
    
    for (let col = 0; col < numColumns; col++) {
      const { speed, offset } = columns[col];
      const baseRow = (frame * speed + offset) % 24; // Extended range for wrapping
      
      // Draw column of pixels with trailing fade
      for (let i = 0; i < 8; i++) {
        const row = Math.floor(baseRow - i);
        if (row >= 0 && row < 16) {
          const brightness = 1 - (i / 8);
          bitmap[row][col] = { color, brightness };
        }
      }
    }
    
    frames.push(bitmap);
  }
  
  return new AnimatedBitmapController(frames, {
    mode: 'loop',
    timing: { fps },
    autoStart: true
  });
}
```

---

## 🎮 React Integration

### Hook für Animation Management

```typescript
/**
 * React hook for managing animated bitmaps
 */
function useAnimatedBitmap(
  controller: AnimatedBitmapController | null
) {
  const [currentBitmap, setCurrentBitmap] = useState<LEDBitmap>(
    createEmptyBitmap()
  );
  
  useEffect(() => {
    if (!controller) return;
    
    // Update bitmap on each frame
    const onFrame = () => {
      setCurrentBitmap(controller.getCurrentBitmap());
    };
    
    // Initial frame
    onFrame();
    
    // Subscribe to frame updates
    controller.config.callbacks = {
      ...controller.config.callbacks,
      onFrame
    };
    
    return () => {
      controller.stop();
    };
  }, [controller]);
  
  return currentBitmap;
}
```

---

## 💡 Verwendungsbeispiele

### 1. Loading Spinner während Verarbeitung

```typescript
function MyComponent() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [animation, setAnimation] = useState<AnimatedBitmapController | null>(null);
  
  useEffect(() => {
    if (isProcessing) {
      const spinner = createLoadingSpinner('#FF4500', 15);
      setAnimation(spinner);
    } else {
      animation?.stop();
      setAnimation(null);
    }
  }, [isProcessing]);
  
  const bitmap = useAnimatedBitmap(animation);
  
  return <LEDPixelDisplay bitmap={bitmap} />;
}
```

### 2. Recording Pulse Animation

```typescript
function RecordingIndicator({ isRecording }: { isRecording: boolean }) {
  const animation = useMemo(() => {
    return isRecording 
      ? createPulseAnimation('#FF0000', 20)
      : null;
  }, [isRecording]);
  
  const bitmap = useAnimatedBitmap(animation);
  
  return (
    <LEDPixelDisplay 
      bitmap={bitmap}
      transition={{ enabled: true, type: 'fade', duration: 200 }}
    />
  );
}
```

### 3. Success Animation (One-Shot)

```typescript
async function showSuccessAnimation() {
  // Create checkmark animation
  const frames = await createPNGAnimation([
    '/assets/anim/success-frame-1.png',
    '/assets/anim/success-frame-2.png',
    '/assets/anim/success-frame-3.png'
  ], {
    fps: 8,
    mode: 'once',
    colorMode: 'threshold',
    onColor: '#00FF00'
  });
  
  // Wait for completion
  await new Promise(resolve => {
    frames.config.callbacks = {
      onComplete: resolve
    };
  });
  
  // Return to idle state
  return createEmptyBitmap();
}
```

### 4. Wechsel zwischen Animationen

```typescript
function AnimatedDisplay() {
  const [mode, setMode] = useState<'idle' | 'recording' | 'processing'>('idle');
  
  const animation = useMemo(() => {
    switch (mode) {
      case 'idle':
        return null; // Static bitmap
      
      case 'recording':
        return createPulseAnimation('#FF0000', 20);
      
      case 'processing':
        return createLoadingSpinner('#FFD700', 15);
      
      default:
        return null;
    }
  }, [mode]);
  
  const bitmap = useAnimatedBitmap(animation);
  
  return (
    <LEDPixelDisplay 
      bitmap={bitmap}
      transition={{
        enabled: true,
        type: 'fade',
        duration: 300
      }}
    />
  );
}
```

### 5. Sprite Sheet Animation

```typescript
async function loadCharacterAnimation() {
  const anim = await createSpriteSheetAnimation(
    '/assets/character-walk-sprite.png',
    {
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 8,
      framesPerRow: 4,
      fps: 12,
      mode: 'loop'
    }
  );
  
  return anim;
}
```

### 6. Kombinierte Animation mit Events

```typescript
function NotificationAnimation() {
  const [animation, setAnimation] = useState<AnimatedBitmapController | null>(null);
  
  const showNotification = async () => {
    // Phase 1: Pulse in
    const pulseIn = createPulseAnimation('#FFD700', 30);
    pulseIn.config.callbacks = {
      onComplete: () => {
        // Phase 2: Hold icon
        const icon = new StaticBitmap(notificationIcon);
        setTimeout(() => {
          // Phase 3: Fade out
          setAnimation(null);
        }, 2000);
      }
    };
    
    setAnimation(pulseIn);
  };
  
  const bitmap = useAnimatedBitmap(animation);
  
  return <LEDPixelDisplay bitmap={bitmap} />;
}
```

---

## 🎬 Timeline-basierte Animation (Advanced)

```typescript
/**
 * Timeline für komplexe Animationsabläufe
 */
class AnimationTimeline {
  private sequences: Array<{
    startTime: number;
    controller: AnimatedBitmapController;
  }> = [];
  
  private startTime: number = 0;
  
  addSequence(
    delay: number, 
    controller: AnimatedBitmapController
  ): this {
    this.sequences.push({
      startTime: delay,
      controller
    });
    return this;
  }
  
  play(): void {
    this.startTime = performance.now();
    this.sequences.forEach(({ startTime, controller }) => {
      setTimeout(() => controller.start(), startTime);
    });
  }
  
  stop(): void {
    this.sequences.forEach(({ controller }) => controller.stop());
  }
}

// Verwendung:
const timeline = new AnimationTimeline();

timeline
  .addSequence(0, createPulseAnimation('#FF0000'))
  .addSequence(1000, createLoadingSpinner('#FFD700'))
  .addSequence(2000, createWaveAnimation('#00BFFF'))
  .play();
```

---

## 📁 Dateistruktur

```
client/src/lib/ledBitmap/
├── animation/
│   ├── AnimatedBitmapController.ts  # Haupt-Controller
│   ├── AnimationTimeline.ts         # Timeline-System
│   ├── builders/
│   │   ├── frameAnimation.ts        # Frame-based builders
│   │   ├── pngAnimation.ts          # PNG sequence loader
│   │   └── spriteSheetAnimation.ts  # Sprite sheet parser
│   └── procedural/
│       ├── loadingSpinner.ts
│       ├── progressBar.ts
│       ├── pulseEffect.ts
│       ├── waveEffect.ts
│       └── matrixRain.ts
├── hooks/
│   └── useAnimatedBitmap.ts         # React hook
└── index.ts

public/assets/animations/
├── sprites/
│   └── character-walk-16x16.png
├── sequences/
│   ├── success/
│   │   ├── frame-0.png
│   │   ├── frame-1.png
│   │   └── frame-2.png
│   └── recording/
│       ├── frame-0.png
│       └── frame-1.png
└── icons/
    └── (static icons)
```

---

## ✅ Vorteile

1. **Flexibilität**: Frame-based, procedural und programmatic animations
2. **Performance**: Optimiertes Frame-Caching und requestAnimationFrame
3. **Kontrolle**: Play/Pause/Stop, variable FPS, custom timing
4. **Events**: Callbacks für alle wichtigen Animation-Events
5. **React-Integration**: Seamless mit hooks und state management
6. **Wiederverwendbarkeit**: Factory functions für häufige Patterns
7. **Erweiterbarkeit**: Einfach neue procedural generators hinzufügen

---

## 🚀 Nächste Schritte

1. **AnimatedBitmapController** implementieren
2. **Procedural Generators** erstellen (Spinner, Pulse, Wave)
3. **PNG/Sprite Sheet Loader** implementieren
4. **useAnimatedBitmap Hook** erstellen
5. **Test-Assets** erstellen (Beispiel-Sprites, Animationen)
6. **Integration** in bestehende App (home.tsx)
7. **Performance-Tests** durchführen
8. **Dokumentation** mit Live-Beispielen erweitern

---

## 🎯 Integration in home.tsx

```typescript
// State für aktuellen Display-Modus
const [displayMode, setDisplayMode] = useState<
  'idle' | 'recording' | 'processing' | 'success'
>('idle');

// Animation basierend auf Modus
const animation = useMemo(() => {
  switch (displayMode) {
    case 'idle':
      return null;
    
    case 'recording':
      if (audioStream) {
        return audioSpectrumProvider; // Live audio
      }
      return createPulseAnimation('#FF0000', 20);
    
    case 'processing':
      return createLoadingSpinner('#FFD700', 15);
    
    case 'success':
      // One-shot success animation
      const anim = createPulseAnimation('#00FF00', 30);
      anim.config.callbacks = {
        onComplete: () => setDisplayMode('idle')
      };
      return anim;
    
    default:
      return null;
  }
}, [displayMode, audioStream]);

const bitmap = useAnimatedBitmap(animation);

<LEDPixelDisplay 
  bitmap={bitmap}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 300
  }}
/>
```
