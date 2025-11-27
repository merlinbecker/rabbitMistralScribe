
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { LEDBitmap, BitmapProvider, TransitionConfig } from '@/lib/ledBitmap/types';
import { AudioSpectrumBitmap } from '@/lib/ledBitmap/providers/AudioSpectrumBitmap';
import { TransitionEngine } from '@/lib/ledBitmap/TransitionEngine';
import { createEmptyBitmap } from '@/lib/ledBitmap/utils/bitmapUtils';


/**
 * New API - Accepts bitmap directly
 */
export interface LEDPixelDisplayNewProps {
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

/**
 * Legacy API - For backward compatibility
 * @deprecated Use bitmap prop instead
 */
export interface LEDPixelDisplayLegacyProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}

export type LEDPixelDisplayProps = LEDPixelDisplayNewProps | LEDPixelDisplayLegacyProps;

/**
 * Type guard to check if props are legacy
 */
function isLegacyProps(props: LEDPixelDisplayProps): props is LEDPixelDisplayLegacyProps {
  return 'isRecording' in props && 'audioStream' in props;
}

// Pre-compiled regex for hex color parsing (performance optimization)
const HEX_COLOR_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

/**
 * Parse hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = HEX_COLOR_REGEX.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

/**
 * Apply brightness to a hex color and return rgba string
 */
function applyBrightness(color: string, brightness: number): string {
  const rgb = hexToRgb(color);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${brightness})`;
}

/**
 * Draw a rounded rectangle on canvas
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Serialize bitmap for dirty checking - fast hash comparison
 * Uses array join for better performance with frequent updates
 */
function serializeBitmap(bitmap: LEDBitmap): string {
  const parts: string[] = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const p = bitmap[row][col];
      parts.push(p.color + (p.brightness ?? 1));
    }
  }
  return parts.join('');
}

/**
 * Calculate pixel layout dimensions based on canvas size
 */
interface PixelLayout {
  padding: number;
  pixelSize: number;
  gapScaled: number;
  radiusScaled: number;
}

function calculatePixelLayout(canvasSize: number, pixelGap: number, borderRadius: number): PixelLayout {
  const padding = 4; // Corresponds to p-1 in tailwind
  const gridSize = canvasSize - 2 * padding;
  const scaleFactor = canvasSize / 224; // Base size reference
  const gapScaled = pixelGap * scaleFactor;
  const radiusScaled = borderRadius * scaleFactor;
  const pixelSize = (gridSize - 15 * gapScaled) / 16;
  
  return { padding, pixelSize, gapScaled, radiusScaled };
}

/**
 * Render the pixel grid to a canvas context
 */
function renderPixelGrid(
  ctx: CanvasRenderingContext2D,
  bitmap: LEDBitmap,
  layout: PixelLayout
): void {
  const { padding, pixelSize, gapScaled, radiusScaled } = layout;
  
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const pixel = bitmap[row][col];
      const x = padding + col * (pixelSize + gapScaled);
      const y = padding + row * (pixelSize + gapScaled);

      // Apply color with brightness
      ctx.fillStyle = applyBrightness(pixel.color, pixel.brightness ?? 1.0);

      // Draw pixel with optional border radius
      if (radiusScaled > 0.5) {
        drawRoundedRect(ctx, x, y, pixelSize, pixelSize, radiusScaled);
      } else {
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }
}

/**
 * Setup canvas context with proper scaling and settings
 */
function setupCanvasContext(ctx: CanvasRenderingContext2D, canvasSize: number): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  
  // Clear canvas with black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
}

/**
 * Canvas-based LED Pixel Display component
 * Performance optimized for weak devices like Rabbit R1
 */
export function LEDPixelDisplay(props: LEDPixelDisplayProps) {
  // Convert legacy props to new bitmap-based API
  const normalizedProps: LEDPixelDisplayNewProps = useMemo(() => {
    if (isLegacyProps(props)) {
      // Create AudioSpectrumBitmap provider from legacy props
      const audioProvider = new AudioSpectrumBitmap(props.audioStream, props.isRecording);
      if (props.isRecording && props.audioStream) {
        audioProvider.start();
      }
      
      return {
        bitmap: () => audioProvider.getBitmap(),
        refreshRate: 60,
        pixelGap: 1,
        borderRadius: 1
      };

    }
    return {
      ...props,
      refreshRate: props.refreshRate ?? 60,
      pixelGap: props.pixelGap ?? 1,
      borderRadius: props.borderRadius ?? 1,
      transition: props.transition ?? { enabled: false, type: 'fade', duration: 300 }
    };
  }, [props]);


  const {
    bitmap,
    transition = { enabled: false, type: 'fade', duration: 300 },
    refreshRate = 60,
    pixelGap = 1,
    borderRadius = 1,
    className = ''
  } = normalizedProps;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBitmapHashRef = useRef<string>('');
  const canvasSizeRef = useRef<number>(0);

  const [currentBitmap, setCurrentBitmap] = useState<LEDBitmap>(createEmptyBitmap());
  const transitionEngineRef = useRef(new TransitionEngine(transition));
  const animationFrameRef = useRef<number>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  // Render bitmap to canvas
  const renderCanvas = useCallback((bitmapToRender: LEDBitmap) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Get container size for responsive canvas
    const canvasSize = container.clientWidth;

    // Only resize canvas if size changed
    if (canvasSizeRef.current !== canvasSize) {
      canvasSizeRef.current = canvasSize;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasSize * dpr;
      canvas.height = canvasSize * dpr;
      canvas.style.width = `${canvasSize}px`;
      canvas.style.height = `${canvasSize}px`;
      lastBitmapHashRef.current = ''; // Force redraw after resize
    }

    // Dirty check - only render if bitmap changed
    const currentHash = serializeBitmap(bitmapToRender);
    if (currentHash === lastBitmapHashRef.current) return;
    lastBitmapHashRef.current = currentHash;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup context and render
    setupCanvasContext(ctx, canvasSize);
    const layout = calculatePixelLayout(canvasSize, pixelGap, borderRadius);
    renderPixelGrid(ctx, bitmapToRender, layout);
  }, [pixelGap, borderRadius]);

  // Update transition config when it changes
  useEffect(() => {
    transitionEngineRef.current.updateConfig(transition);
  }, [transition]);

  // Update bitmap from provider
  useEffect(() => {
    let isActive = true;

    const updateBitmap = async () => {
      if (!isActive) return;

      try {
        // Get new bitmap (sync or async)
        const newBitmap = typeof bitmap === 'function' 
          ? await bitmap() 
          : bitmap;

        if (!isActive) return;

        // Start transition if enabled
        if (transition.enabled && currentBitmap) {
          transitionEngineRef.current.startTransition(currentBitmap, newBitmap);
        } else {
          setCurrentBitmap(newBitmap);
        }

        // Schedule next update for dynamic sources
        if (typeof bitmap === 'function') {
          updateTimeoutRef.current = setTimeout(() => updateBitmap(), 1000 / refreshRate);
        }
      } catch (error) {
        console.error('Failed to update bitmap:', error);
      }
    };

    updateBitmap();

    return () => {
      isActive = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
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

  // Cleanup legacy audio provider
  useEffect(() => {
    if (isLegacyProps(props)) {
      return () => {
        // AudioSpectrumBitmap cleanup is handled by the provider
      };
    }
  }, [props]);

  // Render canvas when bitmap changes
  useEffect(() => {
    renderCanvas(currentBitmap);
  }, [currentBitmap, renderCanvas]);

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Force canvas resize on container resize
      canvasSizeRef.current = 0;
      renderCanvas(currentBitmap);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentBitmap, renderCanvas]);

  return (
    <div 
      ref={containerRef}
      className={`w-full aspect-square mx-auto bg-black rounded-md ${className}`}
      data-testid="led-display"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-md"
        data-testid="led-canvas"
      />
    </div>
  );
}
