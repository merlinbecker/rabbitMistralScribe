
import { useEffect, useRef, useState, useMemo } from 'react';
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


  const [currentBitmap, setCurrentBitmap] = useState<LEDBitmap>(createEmptyBitmap());
  const transitionEngineRef = useRef(new TransitionEngine(transition));
  const animationFrameRef = useRef<number>();
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

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

  // Render pixels - SAME STRUCTURE AS BEFORE
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
