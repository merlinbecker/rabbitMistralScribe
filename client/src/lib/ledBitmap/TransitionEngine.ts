/**
 * TransitionEngine - Handles smooth transitions between bitmaps
 */

import type { LEDBitmap, TransitionConfig, EasingFunction } from './types';
import { interpolateColor } from './utils/colorUtils';
import { createEmptyBitmap } from './utils/bitmapUtils';

export class TransitionEngine {
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
      return this.targetBitmap || createEmptyBitmap();
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
      case 'slide-right':
        return this.slideBitmaps(easedProgress, 'right');
      case 'slide-up':
        return this.slideBitmaps(easedProgress, 'up');
      case 'slide-down':
        return this.slideBitmaps(easedProgress, 'down');
      case 'dissolve':
        return this.dissolveBitmaps(easedProgress);
      case 'wipe-horizontal':
        return this.wipeHorizontal(easedProgress);
      case 'wipe-vertical':
        return this.wipeVertical(easedProgress);
      default:
        return this.targetBitmap;
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: TransitionConfig): void {
    this.config = config;
  }
  
  /**
   * Fade transition - interpolate all colors
   */
  private fadeBitmaps(progress: number): LEDBitmap {
    const result: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        const fromPixel = this.startBitmap![row][col];
        const toPixel = this.targetBitmap![row][col];
        
        result[row][col] = {
          color: interpolateColor(fromPixel.color, toPixel.color, progress),
          brightness: this.interpolateBrightness(
            fromPixel.brightness ?? 1.0,
            toPixel.brightness ?? 1.0,
            progress
          )
        };
      }
    }
    
    return result;
  }
  
  /**
   * Slide transition - move bitmap in a direction
   */
  private slideBitmaps(progress: number, direction: 'left' | 'right' | 'up' | 'down'): LEDBitmap {
    const result: LEDBitmap = [];
    const offset = Math.floor(16 * progress);
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        let sourceRow = row;
        let sourceCol = col;
        let sourceBitmap = this.startBitmap!;
        
        switch (direction) {
          case 'left':
            sourceCol = col + offset;
            if (sourceCol >= 16) {
              sourceCol -= 16;
              sourceBitmap = this.targetBitmap!;
            }
            break;
          case 'right':
            sourceCol = col - offset;
            if (sourceCol < 0) {
              sourceCol += 16;
              sourceBitmap = this.targetBitmap!;
            }
            break;
          case 'up':
            sourceRow = row + offset;
            if (sourceRow >= 16) {
              sourceRow -= 16;
              sourceBitmap = this.targetBitmap!;
            }
            break;
          case 'down':
            sourceRow = row - offset;
            if (sourceRow < 0) {
              sourceRow += 16;
              sourceBitmap = this.targetBitmap!;
            }
            break;
        }
        
        result[row][col] = { ...sourceBitmap[sourceRow][sourceCol] };
      }
    }
    
    return result;
  }
  
  /**
   * Dissolve transition - random pixel-by-pixel
   */
  private dissolveBitmaps(progress: number): LEDBitmap {
    const result: LEDBitmap = [];
    
    // Create a deterministic random sequence based on pixel position
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        // Simple deterministic random based on position
        const pixelThreshold = ((row * 16 + col) % 256) / 256;
        
        const sourceBitmap = progress > pixelThreshold ? this.targetBitmap! : this.startBitmap!;
        result[row][col] = { ...sourceBitmap[row][col] };
      }
    }
    
    return result;
  }
  
  /**
   * Horizontal wipe transition
   */
  private wipeHorizontal(progress: number): LEDBitmap {
    const result: LEDBitmap = [];
    const wipeCol = Math.floor(16 * progress);
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        const sourceBitmap = col < wipeCol ? this.targetBitmap! : this.startBitmap!;
        result[row][col] = { ...sourceBitmap[row][col] };
      }
    }
    
    return result;
  }
  
  /**
   * Vertical wipe transition
   */
  private wipeVertical(progress: number): LEDBitmap {
    const result: LEDBitmap = [];
    const wipeRow = Math.floor(16 * progress);
    
    for (let row = 0; row < 16; row++) {
      result[row] = [];
      for (let col = 0; col < 16; col++) {
        const sourceBitmap = row < wipeRow ? this.targetBitmap! : this.startBitmap!;
        result[row][col] = { ...sourceBitmap[row][col] };
      }
    }
    
    return result;
  }
  
  /**
   * Apply easing function to progress
   */
  private applyEasing(t: number): number {
    switch (this.config.easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return t * (2 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default:
        return t; // linear
    }
  }
  
  /**
   * Interpolate brightness values
   */
  private interpolateBrightness(from: number, to: number, progress: number): number {
    return from + (to - from) * progress;
  }
}
