/**
 * ImageBitmapProvider - Loads and converts PNG images to LED bitmaps
 */

import type { LEDBitmap, LEDPixel, ImageBitmapProviderOptions, LEDPalette } from '../types';
import { hexToRgb, rgbToHex, colorDistance, getColorBrightness, type RGB } from '../utils/colorUtils';

export class ImageBitmapProvider {
  private bitmap: LEDBitmap | null = null;
  private image: HTMLImageElement | null = null;
  private options: Required<ImageBitmapProviderOptions>;
  
  constructor(options: ImageBitmapProviderOptions) {
    this.options = {
      imageUrl: options.imageUrl,
      colorMode: options.colorMode || 'full',
      threshold: options.threshold ?? 128,
      onColor: options.onColor || '#FF4500',
      offColor: options.offColor || '#000000',
      palette: options.palette || {},
      brightness: options.brightness ?? 1.0,
      cache: options.cache ?? true
    };
  }
  
  /**
   * Load image and convert to LED bitmap
   */
  async load(): Promise<void> {
    // Load image
    this.image = await this.loadImage(this.options.imageUrl);
    
    // Convert to bitmap
    this.bitmap = await this.imageToLEDBitmap(this.image);
  }
  
  /**
   * Get current bitmap (synchronous after load)
   */
  getBitmap(): LEDBitmap {
    if (!this.bitmap) {
      throw new Error('ImageBitmapProvider: Call load() before getBitmap()');
    }
    return this.bitmap;
  }
  
  /**
   * Load image from URL or use existing HTMLImageElement
   */
  private loadImage(source: string | HTMLImageElement): Promise<HTMLImageElement> {
    if (typeof source !== 'string') {
      return Promise.resolve(source);
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Enable CORS for canvas
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${source}`));
      img.src = source;
    });
  }
  
  /**
   * Convert image to 16x16 LED bitmap using Canvas API
   */
  private async imageToLEDBitmap(image: HTMLImageElement): Promise<LEDBitmap> {
    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Draw image scaled to 16x16
    ctx.imageSmoothingEnabled = false; // Pixel-perfect scaling
    ctx.drawImage(image, 0, 0, 16, 16);
    
    // Extract pixel data
    const imageData = ctx.getImageData(0, 0, 16, 16);
    const pixels = imageData.data; // RGBA array
    
    // Convert to LED bitmap based on color mode
    const bitmap: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      bitmap[row] = [];
      for (let col = 0; col < 16; col++) {
        const idx = (row * 16 + col) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const a = pixels[idx + 3];
        
        bitmap[row][col] = this.rgbaToLEDPixel(r, g, b, a);
      }
    }
    
    return bitmap;
  }
  
  /**
   * Convert RGBA values to LED pixel based on color mode
   */
  private rgbaToLEDPixel(r: number, g: number, b: number, a: number): LEDPixel {
    // Handle transparency
    if (a < 128) {
      return { color: this.options.offColor, brightness: 0 };
    }
    
    switch (this.options.colorMode) {
      case 'threshold':
        return this.thresholdMode(r, g, b, a);
      
      case 'palette':
        return this.paletteMode(r, g, b, a);
      
      case 'monochrome':
        return this.monochromeMode(r, g, b, a);
      
      case 'full':
      default:
        return this.fullColorMode(r, g, b, a);
    }
  }
  
  /**
   * Full color mode: Use exact RGB colors
   */
  private fullColorMode(r: number, g: number, b: number, a: number): LEDPixel {
    const color = rgbToHex(r, g, b);
    const brightness = (a / 255) * this.options.brightness;
    return { color, brightness };
  }
  
  /**
   * Threshold mode: Binary on/off based on brightness
   */
  private thresholdMode(r: number, g: number, b: number, a: number): LEDPixel {
    const brightness = (r + g + b) / 3;
    const isOn = brightness > this.options.threshold;
    
    return {
      color: isOn ? this.options.onColor : this.options.offColor,
      brightness: (a / 255) * this.options.brightness
    };
  }
  
  /**
   * Palette mode: Map to nearest color in palette
   */
  private paletteMode(r: number, g: number, b: number, a: number): LEDPixel {
    const inputColor: RGB = { r, g, b };
    let nearestColor = this.options.offColor;
    let minDistance = Infinity;
    
    // Find nearest palette color
    for (const hexColor of Object.values(this.options.palette)) {
      const paletteRgb = hexToRgb(hexColor);
      const distance = colorDistance(inputColor, paletteRgb);
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestColor = hexColor;
      }
    }
    
    return {
      color: nearestColor,
      brightness: (a / 255) * this.options.brightness
    };
  }
  
  /**
   * Monochrome mode: Single color with brightness variation
   */
  private monochromeMode(r: number, g: number, b: number, a: number): LEDPixel {
    const brightness = ((r + g + b) / 3 / 255) * (a / 255) * this.options.brightness;
    
    return {
      color: this.options.onColor,
      brightness
    };
  }
}
