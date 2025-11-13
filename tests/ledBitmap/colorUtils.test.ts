/**
 * Tests for color utility functions
 */

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  interpolateColor,
  colorDistance,
  getColorBrightness
} from '../../client/src/lib/ledBitmap/utils/colorUtils';

describe('colorUtils', () => {
  describe('hexToRgb', () => {
    it('should convert hex to RGB', () => {
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00FF00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000FF')).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });
    
    it('should handle hex without # prefix', () => {
      expect(hexToRgb('FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    });
    
    it('should return black for invalid hex', () => {
      expect(hexToRgb('invalid')).toEqual({ r: 0, g: 0, b: 0 });
    });
  });
  
  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
    });
    
    it('should pad single digit hex values', () => {
      expect(rgbToHex(15, 15, 15)).toBe('#0f0f0f');
    });
  });
  
  describe('interpolateColor', () => {
    it('should interpolate between two colors', () => {
      const black = '#000000';
      const white = '#ffffff';
      
      expect(interpolateColor(black, white, 0)).toBe(black);
      expect(interpolateColor(black, white, 1)).toBe(white);
      
      // Mid-point should be gray
      const midpoint = interpolateColor(black, white, 0.5);
      const rgb = hexToRgb(midpoint);
      expect(rgb.r).toBeCloseTo(128, 0);
      expect(rgb.g).toBeCloseTo(128, 0);
      expect(rgb.b).toBeCloseTo(128, 0);
    });
    
    it('should interpolate between colored values', () => {
      const red = '#ff0000';
      const blue = '#0000ff';
      
      const halfway = interpolateColor(red, blue, 0.5);
      const rgb = hexToRgb(halfway);
      expect(rgb.r).toBeCloseTo(128, 0);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBeCloseTo(128, 0);
    });
  });
  
  describe('colorDistance', () => {
    it('should calculate distance between colors', () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };
      const red = { r: 255, g: 0, b: 0 };
      
      expect(colorDistance(black, black)).toBe(0);
      expect(colorDistance(black, white)).toBeGreaterThan(0);
      expect(colorDistance(black, red)).toBeLessThan(colorDistance(black, white));
    });
  });
  
  describe('getColorBrightness', () => {
    it('should calculate brightness', () => {
      expect(getColorBrightness({ r: 0, g: 0, b: 0 })).toBe(0);
      expect(getColorBrightness({ r: 255, g: 255, b: 255 })).toBe(255);
      expect(getColorBrightness({ r: 128, g: 128, b: 128 })).toBeCloseTo(128, 0);
    });
  });
});
