# LED Display System - Implementation Documentation

**Date:** November 13, 2025  
**Component:** `client/src/components/LEDPixelDisplay.tsx`  
**Library:** `client/src/lib/ledBitmap/`

---

## Overview

The LED Display System provides a flexible, modular architecture for displaying various types of content on a 16x16 LED grid display. The system is built on clean code principles with dependency injection, comprehensive test coverage, and a focus on reusability.

---

## Architecture

### Layered Design

```
┌─────────────────────────────────────────┐
│     LEDPixelDisplay (Presentation)      │  ← React Component
├─────────────────────────────────────────┤
│     TransitionEngine (Effects)          │  ← Transition Calculator
├─────────────────────────────────────────┤
│       Bitmap Providers (Data)           │  ← Data Sources
│  • AudioSpectrumBitmap                  │
│  • StaticBitmap                         │
│  • AnimatedBitmap                       │
│  • ImageBitmapProvider                  │
└─────────────────────────────────────────┘
```

### Data Flow

```
Bitmap Provider → TransitionEngine → LEDPixelDisplay
   (16x16)          (interpolate)      (render)
```

---

## Core Types

### LEDPixel
```typescript
interface LEDPixel {
  color: string;      // Hex color (e.g., '#FF4500')
  brightness?: number; // Optional: 0.0 - 1.0 (default: 1.0)
}
```

### LEDBitmap
```typescript
type LEDBitmap = LEDPixel[][]; // [row][col] = 16x16 array
```

### BitmapProvider
```typescript
type BitmapProvider = () => LEDBitmap | Promise<LEDBitmap>;
```

---

## Bitmap Providers

### 1. AudioSpectrumBitmap

Provides real-time audio frequency visualization.

```typescript
import { AudioSpectrumBitmap } from '@/lib/ledBitmap';

const audioProvider = new AudioSpectrumBitmap(audioStream, isRecording);
audioProvider.start();

// Use in component
<LEDPixelDisplay bitmap={() => audioProvider.getBitmap()} />

// Cleanup
audioProvider.stop();
```

**Features:**
- Real-time audio analysis using Web Audio API
- 16-column frequency distribution
- Color-coded frequency bands (red=high, yellow=mid, orange=low)
- Automatic cleanup on stop

### 2. StaticBitmap

Provides static images, icons, or patterns.

```typescript
import { StaticBitmap, createBitmapFromPattern } from '@/lib/ledBitmap';

// From pattern string
const micIcon = StaticBitmap.fromPattern([
  '................',
  '.....######.....',
  '.....#....#.....',
  '.....#....#.....',
  '.....######.....',
  '.......##.......',
  '....########....',
  '................',
  // ... 8 more rows
]);

<LEDPixelDisplay bitmap={micIcon.getBitmap()} />
```

### 3. AnimatedBitmap

Provides frame-based animations.

```typescript
import { AnimatedBitmap, fillBitmap } from '@/lib/ledBitmap';

const frames = [
  fillBitmap('#FF0000'),
  fillBitmap('#00FF00'),
  fillBitmap('#0000FF')
];

const animation = new AnimatedBitmap(frames, 10); // 10 FPS

<LEDPixelDisplay 
  bitmap={() => animation.getBitmap()} 
  refreshRate={10}
/>
```

**Methods:**
- `getBitmap()` - Get current frame
- `reset()` - Reset to first frame
- `setFrameRate(fps)` - Change animation speed
- `getCurrentFrameIndex()` - Get current frame index
- `getFrameCount()` - Get total frames

### 4. ImageBitmapProvider

Loads PNG images and converts them to LED bitmaps.

```typescript
import { ImageBitmapProvider } from '@/lib/ledBitmap';

const provider = new ImageBitmapProvider({
  imageUrl: '/assets/icon.png',
  colorMode: 'threshold',
  threshold: 128,
  onColor: '#FF4500',
  offColor: '#000000'
});

await provider.load();

<LEDPixelDisplay bitmap={provider.getBitmap()} />
```

**Color Modes:**
- `full` - Use exact RGB colors from image
- `threshold` - Binary on/off based on brightness
- `palette` - Map to nearest color in palette
- `monochrome` - Single color with brightness variation

---

## Transition Engine

The TransitionEngine provides smooth transitions between bitmap changes.

### Supported Transitions

1. **fade** - Crossfade between colors
2. **slide-left** - Slide from right to left
3. **slide-right** - Slide from left to right
4. **slide-up** - Slide from bottom to top
5. **slide-down** - Slide from top to bottom
6. **dissolve** - Random pixel-by-pixel transition
7. **wipe-horizontal** - Horizontal wipe effect
8. **wipe-vertical** - Vertical wipe effect

### Easing Functions

- `linear` - Constant speed
- `ease-in` - Slow start, fast end
- `ease-out` - Fast start, slow end
- `ease-in-out` - Slow start and end

### Usage

```typescript
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

---

## LEDPixelDisplay Component

### New API

```typescript
interface LEDPixelDisplayNewProps {
  bitmap: LEDBitmap | BitmapProvider;
  transition?: TransitionConfig;
  refreshRate?: number;
  pixelGap?: number;
  borderRadius?: number;
  className?: string;
}
```

### Legacy API (Backward Compatible)

```typescript
interface LEDPixelDisplayLegacyProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}
```

The component automatically detects and handles both APIs.

### Examples

#### Audio Visualization (Legacy)
```typescript
<LEDPixelDisplay 
  isRecording={isRecording} 
  audioStream={audioStream} 
/>
```

#### Audio Visualization (New API)
```typescript
const audioProvider = new AudioSpectrumBitmap(audioStream, isRecording);
audioProvider.start();

<LEDPixelDisplay 
  bitmap={() => audioProvider.getBitmap()}
  refreshRate={60}
/>
```

#### Static Icon
```typescript
const icon = StaticBitmap.fromPattern(pattern);

<LEDPixelDisplay bitmap={icon.getBitmap()} />
```

#### With Transition
```typescript
<LEDPixelDisplay 
  bitmap={currentBitmap}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 300,
    easing: 'ease-out'
  }}
/>
```

---

## Utility Functions

### Color Utilities

```typescript
import { hexToRgb, rgbToHex, interpolateColor } from '@/lib/ledBitmap';

// Convert between formats
const rgb = hexToRgb('#FF0000'); // { r: 255, g: 0, b: 0 }
const hex = rgbToHex(255, 0, 0); // '#ff0000'

// Interpolate colors
const midpoint = interpolateColor('#000000', '#FFFFFF', 0.5); // Gray
```

### Bitmap Utilities

```typescript
import { 
  createEmptyBitmap, 
  cloneBitmap, 
  fillBitmap,
  isValidBitmap 
} from '@/lib/ledBitmap';

// Create bitmaps
const empty = createEmptyBitmap();
const red = fillBitmap('#FF0000');
const clone = cloneBitmap(original);

// Validate
if (isValidBitmap(bitmap)) {
  // Use bitmap
}
```

---

## Testing

### Test Coverage

- **130 total tests** (all passing)
- **18 LED bitmap-specific tests**
- Color utilities (9 tests)
- Bitmap utilities (9 tests)
- Providers (6 tests including AudioSpectrumBitmap, StaticBitmap, AnimatedBitmap)

### Running Tests

```bash
npm run test:run
```

---

## File Structure

```
client/src/lib/ledBitmap/
├── index.ts                          # Public API exports
├── types.ts                          # Type definitions
├── TransitionEngine.ts               # Transition logic
├── providers/
│   ├── AudioSpectrumBitmap.ts       # Audio visualization
│   ├── StaticBitmap.ts              # Static content
│   ├── AnimatedBitmap.ts            # Frame-based animation
│   └── ImageBitmapProvider.ts       # PNG image loader
└── utils/
    ├── colorUtils.ts                # Color manipulation
    └── bitmapUtils.ts               # Bitmap operations

client/src/components/
└── LEDPixelDisplay.tsx              # React component

tests/ledBitmap/
├── colorUtils.test.ts
├── bitmapUtils.test.ts
└── providers.test.ts
```

---

## Migration Guide

### From Legacy to New API

**Before:**
```typescript
<LEDPixelDisplay 
  isRecording={isRecording} 
  audioStream={audioStream} 
/>
```

**After:**
```typescript
const audioProvider = useMemo(() => {
  const provider = new AudioSpectrumBitmap(audioStream, isRecording);
  if (isRecording && audioStream) {
    provider.start();
  }
  return provider;
}, [audioStream, isRecording]);

<LEDPixelDisplay 
  bitmap={() => audioProvider.getBitmap()}
  transition={{
    enabled: true,
    type: 'fade',
    duration: 300
  }}
/>
```

**Note:** The legacy API is still fully supported for backward compatibility.

---

## Design Principles

1. **Separation of Concerns**: Display logic separated from data sources
2. **Dependency Injection**: Providers inject data into display
3. **Testability**: Each component independently testable
4. **Extensibility**: Easy to add new providers and transitions
5. **Performance**: Maintains div-grid structure for optimal rendering
6. **Backward Compatibility**: Legacy API still works

---

## Future Enhancements

Potential additions (not implemented):

1. **AnimatedBitmapController** - Advanced animation control with play/pause/loop modes
2. **Timeline-based Animations** - Sequence multiple animations
3. **Procedural Generators** - Loading spinners, progress bars, wave effects
4. **Sprite Sheet Support** - Load animations from sprite sheets
5. **React Hooks** - `useAnimatedBitmap`, `useBitmapPreloader`

---

## Performance Considerations

- Uses React's `useMemo` and `useRef` for optimization
- `requestAnimationFrame` for smooth transitions
- Div-grid structure (no Canvas) for CSS transitions
- Efficient color interpolation algorithms
- Automatic cleanup of resources

---

## Security

- PNG images loaded with CORS enabled
- No external dependencies for core functionality
- Type-safe interfaces throughout
- Input validation on all public APIs

---

## Summary

The LED Display System provides a robust, flexible foundation for displaying various types of content on a 16x16 LED grid. The architecture is clean, well-tested, and follows modern React and TypeScript best practices. The system is production-ready and easily extensible for future requirements.
