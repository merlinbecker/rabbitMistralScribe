/**
 * Bitmap utility functions
 */

import type { LEDBitmap, LEDPixel } from '../types';

/**
 * Create an empty 16x16 bitmap (all black)
 */
export function createEmptyBitmap(): LEDBitmap {
  return Array(16).fill(null).map(() => 
    Array(16).fill(null).map(() => ({ color: '#000000' }))
  );
}

/**
 * Clone a bitmap
 */
export function cloneBitmap(bitmap: LEDBitmap): LEDBitmap {
  return bitmap.map(row => 
    row.map(pixel => ({ ...pixel }))
  );
}

/**
 * Validate that a bitmap is 16x16
 */
export function isValidBitmap(bitmap: LEDBitmap): boolean {
  if (!bitmap || bitmap.length !== 16) return false;
  
  for (const row of bitmap) {
    if (!row || row.length !== 16) return false;
  }
  
  return true;
}

/**
 * Create a bitmap from a simple pattern string array
 * @param pattern Array of 16 strings, each with 16 characters
 * @param onChar Character representing an active pixel (default: '#')
 * @param onColor Color for active pixels (default: '#FF4500')
 * @param offColor Color for inactive pixels (default: '#000000')
 */
export function createBitmapFromPattern(
  pattern: string[],
  onChar: string = '#',
  onColor: string = '#FF4500',
  offColor: string = '#000000'
): LEDBitmap {
  if (pattern.length !== 16) {
    throw new Error('Pattern must have exactly 16 rows');
  }
  
  const bitmap: LEDBitmap = [];
  
  for (let row = 0; row < 16; row++) {
    if (pattern[row].length !== 16) {
      throw new Error(`Pattern row ${row} must have exactly 16 characters`);
    }
    
    bitmap[row] = [];
    for (let col = 0; col < 16; col++) {
      const char = pattern[row][col];
      bitmap[row][col] = {
        color: char === onChar ? onColor : offColor
      };
    }
  }
  
  return bitmap;
}

/**
 * Fill a bitmap with a solid color
 */
export function fillBitmap(color: string, brightness?: number): LEDBitmap {
  return Array(16).fill(null).map(() => 
    Array(16).fill(null).map(() => ({ color, brightness }))
  );
}
