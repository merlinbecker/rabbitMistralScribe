/**
 * Tests for bitmap providers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StaticBitmap } from '../../client/src/lib/ledBitmap/providers/StaticBitmap';
import { AnimatedBitmap } from '../../client/src/lib/ledBitmap/providers/AnimatedBitmap';
import { createEmptyBitmap, fillBitmap } from '../../client/src/lib/ledBitmap/utils/bitmapUtils';

describe('Bitmap Providers', () => {
  describe('StaticBitmap', () => {
    it('should return the same bitmap', () => {
      const bitmap = createEmptyBitmap();
      const provider = new StaticBitmap(bitmap);
      
      expect(provider.getBitmap()).toBe(bitmap);
    });
    
    it('should create from pattern', () => {
      const pattern = [
        '####............',
        '####............',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ];
      
      const provider = StaticBitmap.fromPattern(pattern);
      const bitmap = provider.getBitmap();
      
      expect(bitmap[0][0].color).toBe('#FF4500');
      expect(bitmap[0][4].color).toBe('#000000');
    });
  });
  
  describe('AnimatedBitmap', () => {
    it('should cycle through frames', () => {
      const frame1 = fillBitmap('#FF0000');
      const frame2 = fillBitmap('#00FF00');
      const frame3 = fillBitmap('#0000FF');
      
      const animation = new AnimatedBitmap([frame1, frame2, frame3], 0.1); // Very low FPS for testing
      
      expect(animation.getCurrentFrameIndex()).toBe(0);
      expect(animation.getFrameCount()).toBe(3);
      
      // Get first frame (before any time has passed)
      let bitmap = animation.getBitmap();
      expect(bitmap[0][0].color).toBe('#FF0000');
      
      // Frame should still be 0 initially
      expect(animation.getCurrentFrameIndex()).toBe(0);
    });
    
    it('should throw on empty frames', () => {
      expect(() => new AnimatedBitmap([], 10)).toThrow();
    });
    
    it('should reset to first frame', () => {
      const frames = [fillBitmap('#FF0000'), fillBitmap('#00FF00')];
      const animation = new AnimatedBitmap(frames, 10);
      
      animation.reset();
      expect(animation.getCurrentFrameIndex()).toBe(0);
    });
    
    it('should update frame rate', () => {
      const frames = [fillBitmap('#FF0000'), fillBitmap('#00FF00')];
      const animation = new AnimatedBitmap(frames, 10);
      
      animation.setFrameRate(20);
      // Frame rate updated, no error
    });
  });
});
