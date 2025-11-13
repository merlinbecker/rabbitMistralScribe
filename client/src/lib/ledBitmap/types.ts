/**
 * LED Bitmap Types
 * Core type definitions for the LED display system
 */

/**
 * Represents a single LED pixel
 */
export interface LEDPixel {
  color: string;      // Hex color (e.g., '#FF4500')
  brightness?: number; // Optional: 0.0 - 1.0 (default: 1.0)
}

/**
 * 16x16 Bitmap representation
 */
export type LEDBitmap = LEDPixel[][]; // [row][col] = 16x16 array

/**
 * Factory function signature for dynamic bitmaps
 */
export type BitmapProvider = () => LEDBitmap | Promise<LEDBitmap>;

/**
 * Transition configuration
 */
export interface TransitionConfig {
  enabled: boolean;
  type: TransitionType;
  duration: number;  // milliseconds
  easing?: EasingFunction;
}

/**
 * Available transition types
 */
export type TransitionType = 
  | 'fade'           // Crossfade between colors
  | 'slide-left'     // Slide from right to left
  | 'slide-right'    // Slide from left to right
  | 'slide-up'       // Slide from bottom to top
  | 'slide-down'     // Slide from top to bottom
  | 'dissolve'       // Random pixel-by-pixel transition
  | 'wipe-vertical'  // Vertical wipe effect
  | 'wipe-horizontal'; // Horizontal wipe effect

/**
 * Easing functions for transitions
 */
export type EasingFunction = 
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

/**
 * Animation playback modes
 */
export type AnimationMode = 
  | 'loop'        // Continuous loop: 1→2→3→1→2→3...
  | 'ping-pong'   // Back and forth: 1→2→3→2→1→2→3...
  | 'once'        // Play once and stop: 1→2→3 [STOP]
  | 'manual';     // External frame control

/**
 * Animation timing configuration
 */
export interface AnimationTiming {
  fps: number;              // Frames per second (default: 10)
  delay?: number;           // Initial delay in ms before start
  frameDurations?: number[]; // Custom duration per frame in ms
  startFrame?: number;      // Start at specific frame (default: 0)
}

/**
 * Animation event callbacks
 */
export interface AnimationCallbacks {
  onStart?: () => void;
  onFrame?: (frameIndex: number) => void;
  onLoop?: (loopCount: number) => void;
  onComplete?: () => void;
  onStop?: () => void;
}

/**
 * Complete animation configuration
 */
export interface AnimationConfig {
  mode: AnimationMode;
  timing: AnimationTiming;
  callbacks?: AnimationCallbacks;
  autoStart?: boolean; // Start immediately (default: true)
}

/**
 * LED color palette for palette-based rendering
 */
export interface LEDPalette {
  [key: string]: string; // Color name → hex color
}

/**
 * Image bitmap provider options
 */
export interface ImageBitmapProviderOptions {
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
