/**
 * AnimatedBitmap - Provides frame-based animation
 */

import type { LEDBitmap } from '../types';

export class AnimatedBitmap {
  private currentFrame = 0;
  private lastUpdate: number | null = null;
  
  constructor(
    private frames: LEDBitmap[],
    private frameRate: number = 10 // FPS
  ) {
    if (frames.length === 0) {
      throw new Error('AnimatedBitmap requires at least one frame');
    }
  }
  
  /**
   * Get current frame
   */
  getBitmap(): LEDBitmap {
    const now = Date.now();
    const frameDuration = 1000 / this.frameRate;
    
    // Initialize lastUpdate on first call
    if (this.lastUpdate === null) {
      this.lastUpdate = now;
    }
    
    if (now - this.lastUpdate >= frameDuration) {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.lastUpdate = now;
    }
    
    return this.frames[this.currentFrame];
  }
  
  /**
   * Reset to first frame
   */
  reset(): void {
    this.currentFrame = 0;
    this.lastUpdate = null;
  }
  
  /**
   * Get total number of frames
   */
  getFrameCount(): number {
    return this.frames.length;
  }
  
  /**
   * Get current frame index
   */
  getCurrentFrameIndex(): number {
    return this.currentFrame;
  }
  
  /**
   * Set frame rate
   */
  setFrameRate(fps: number): void {
    this.frameRate = fps;
  }
}
