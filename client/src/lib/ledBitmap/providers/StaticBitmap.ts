/**
 * StaticBitmap - Provides static bitmap content
 */

import type { LEDBitmap } from '../types';
import { createBitmapFromPattern } from '../utils/bitmapUtils';

export class StaticBitmap {
  constructor(private pixels: LEDBitmap) {}
  
  /**
   * Get the bitmap
   */
  getBitmap(): LEDBitmap {
    return this.pixels;
  }
  
  /**
   * Create from simple pattern
   * @param pattern Array of 16 strings with 16 characters each
   * @param onChar Character representing an active pixel (default: '#')
   * @param onColor Color for active pixels (default: '#FF4500')
   * @param offColor Color for inactive pixels (default: '#000000')
   */
  static fromPattern(
    pattern: string[],
    onChar: string = '#',
    onColor: string = '#FF4500',
    offColor: string = '#000000'
  ): StaticBitmap {
    const bitmap = createBitmapFromPattern(pattern, onChar, onColor, offColor);
    return new StaticBitmap(bitmap);
  }
}
