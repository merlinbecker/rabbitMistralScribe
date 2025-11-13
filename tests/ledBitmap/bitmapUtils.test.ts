/**
 * Tests for bitmap utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyBitmap,
  cloneBitmap,
  isValidBitmap,
  createBitmapFromPattern,
  fillBitmap
} from '../../client/src/lib/ledBitmap/utils/bitmapUtils';

describe('bitmapUtils', () => {
  describe('createEmptyBitmap', () => {
    it('should create a 16x16 black bitmap', () => {
      const bitmap = createEmptyBitmap();
      
      expect(bitmap).toHaveLength(16);
      expect(bitmap[0]).toHaveLength(16);
      expect(bitmap[0][0].color).toBe('#000000');
      expect(bitmap[15][15].color).toBe('#000000');
    });
  });
  
  describe('cloneBitmap', () => {
    it('should create a deep copy of bitmap', () => {
      const original = createEmptyBitmap();
      original[0][0] = { color: '#FF0000' };
      
      const clone = cloneBitmap(original);
      
      expect(clone[0][0].color).toBe('#FF0000');
      
      // Modifying clone should not affect original
      clone[0][0] = { color: '#00FF00' };
      expect(original[0][0].color).toBe('#FF0000');
      expect(clone[0][0].color).toBe('#00FF00');
    });
  });
  
  describe('isValidBitmap', () => {
    it('should validate correct bitmap', () => {
      const bitmap = createEmptyBitmap();
      expect(isValidBitmap(bitmap)).toBe(true);
    });
    
    it('should reject invalid bitmaps', () => {
      expect(isValidBitmap(null as any)).toBe(false);
      expect(isValidBitmap([] as any)).toBe(false);
      expect(isValidBitmap([[]] as any)).toBe(false);
      
      const wrongRows = Array(15).fill(null).map(() => 
        Array(16).fill(null).map(() => ({ color: '#000000' }))
      );
      expect(isValidBitmap(wrongRows)).toBe(false);
      
      const wrongCols = Array(16).fill(null).map(() => 
        Array(15).fill(null).map(() => ({ color: '#000000' }))
      );
      expect(isValidBitmap(wrongCols)).toBe(false);
    });
  });
  
  describe('createBitmapFromPattern', () => {
    it('should create bitmap from pattern', () => {
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
      
      const bitmap = createBitmapFromPattern(pattern);
      
      expect(bitmap[0][0].color).toBe('#FF4500'); // on
      expect(bitmap[0][4].color).toBe('#000000'); // off
      expect(bitmap[1][0].color).toBe('#FF4500'); // on
    });
    
    it('should use custom colors', () => {
      const pattern = [
        '#...............',
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
        '................',
        '................'
      ];
      
      const bitmap = createBitmapFromPattern(pattern, '#', '#00FF00', '#111111');
      
      expect(bitmap[0][0].color).toBe('#00FF00');
      expect(bitmap[0][1].color).toBe('#111111');
    });
    
    it('should throw on invalid pattern size', () => {
      expect(() => createBitmapFromPattern(['#'])).toThrow();
      expect(() => createBitmapFromPattern(Array(16).fill('#'))).toThrow();
    });
  });
  
  describe('fillBitmap', () => {
    it('should fill bitmap with color', () => {
      const bitmap = fillBitmap('#FF0000');
      
      expect(bitmap[0][0].color).toBe('#FF0000');
      expect(bitmap[7][7].color).toBe('#FF0000');
      expect(bitmap[15][15].color).toBe('#FF0000');
    });
    
    it('should set brightness', () => {
      const bitmap = fillBitmap('#FF0000', 0.5);
      
      expect(bitmap[0][0].brightness).toBe(0.5);
    });
  });
});
