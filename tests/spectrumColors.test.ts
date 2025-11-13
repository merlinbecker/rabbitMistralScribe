import { describe, it, expect } from 'vitest';
import {
  SPECTRUM_COLORS,
  getColorForFrequencyBand,
  shouldPixelBeActive,
  isPeakPixel,
  getPixelColor,
} from '../client/src/utils/spectrumColors';

describe('Spectrum Color Utilities', () => {
  describe('SPECTRUM_COLORS', () => {
    it('should have all required color constants', () => {
      expect(SPECTRUM_COLORS.LOW_FREQ).toBe('#FF8C00');
      expect(SPECTRUM_COLORS.MID_FREQ).toBe('#FFD700');
      expect(SPECTRUM_COLORS.HIGH_FREQ).toBe('#FF4500');
      expect(SPECTRUM_COLORS.PEAK).toBe('#FFFFFF');
      expect(SPECTRUM_COLORS.INACTIVE).toBe('#000000');
    });
  });

  describe('getColorForFrequencyBand', () => {
    it('should return orange for low frequency bands (0-4)', () => {
      expect(getColorForFrequencyBand(0)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(getColorForFrequencyBand(2)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(getColorForFrequencyBand(4)).toBe(SPECTRUM_COLORS.LOW_FREQ);
    });

    it('should return yellow for mid frequency bands (6-10)', () => {
      expect(getColorForFrequencyBand(6)).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(getColorForFrequencyBand(7)).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(getColorForFrequencyBand(10)).toBe(SPECTRUM_COLORS.MID_FREQ);
    });

    it('should return red for high frequency bands (11-15)', () => {
      expect(getColorForFrequencyBand(11)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
      expect(getColorForFrequencyBand(13)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
      expect(getColorForFrequencyBand(15)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
    });

    it('should handle custom number of columns', () => {
      // With 8 columns: 0-2 = low, 3-5 = mid, 6-7 = high
      expect(getColorForFrequencyBand(0, 8)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(getColorForFrequencyBand(2, 8)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(getColorForFrequencyBand(3, 8)).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(getColorForFrequencyBand(5, 8)).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(getColorForFrequencyBand(6, 8)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
      expect(getColorForFrequencyBand(7, 8)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
    });
  });

  describe('shouldPixelBeActive', () => {
    it('should return true for high frequency at bottom row', () => {
      // Row 15 (bottom) has threshold = 0, so any frequency > 0 activates it
      expect(shouldPixelBeActive(10, 15, 16)).toBe(true);
      expect(shouldPixelBeActive(100, 15, 16)).toBe(true);
      expect(shouldPixelBeActive(255, 15, 16)).toBe(true);
    });

    it('should return false for low frequency at top row', () => {
      // Row 0 (top) has threshold = 255, so frequency must be > 255 (impossible)
      expect(shouldPixelBeActive(0, 0, 16)).toBe(false);
      expect(shouldPixelBeActive(100, 0, 16)).toBe(false);
      expect(shouldPixelBeActive(200, 0, 16)).toBe(false);
    });

    it('should return true only when frequency exceeds threshold', () => {
      // Row 8 (middle) has threshold = ((15-8)/15)*255 = 119
      expect(shouldPixelBeActive(120, 8, 16)).toBe(true);
      expect(shouldPixelBeActive(119, 8, 16)).toBe(false);
      expect(shouldPixelBeActive(118, 8, 16)).toBe(false);
    });

    it('should handle different grid sizes', () => {
      // With 8 rows, row 7 (bottom) has threshold = 0
      expect(shouldPixelBeActive(10, 7, 8)).toBe(true);
      // Row 0 (top) has threshold = 255
      expect(shouldPixelBeActive(200, 0, 8)).toBe(false);
    });

    it('should create gradient effect from bottom to top', () => {
      const frequency = 128;
      let activeRows = 0;
      
      for (let row = 0; row < 16; row++) {
        if (shouldPixelBeActive(frequency, row, 16)) {
          activeRows++;
        }
      }
      
      // Should activate roughly half the rows for frequency 128 (half of 255)
      expect(activeRows).toBeGreaterThan(5);
      expect(activeRows).toBeLessThan(12);
    });
  });

  describe('isPeakPixel', () => {
    it('should return false for zero peak', () => {
      expect(isPeakPixel(0, 0, 16)).toBe(false);
      expect(isPeakPixel(0, 8, 16)).toBe(false);
      expect(isPeakPixel(0, 15, 16)).toBe(false);
    });

    it('should return true only for the exact peak row', () => {
      // Peak of 255 should be at row 0 (top)
      expect(isPeakPixel(255, 0, 16)).toBe(true);
      expect(isPeakPixel(255, 1, 16)).toBe(false);
      expect(isPeakPixel(255, 15, 16)).toBe(false);
    });

    it('should calculate correct peak row for mid values', () => {
      // Peak of 128 should be at approximately row 7-8 (middle)
      const peak = 128;
      let peakRow = -1;
      
      for (let row = 0; row < 16; row++) {
        if (isPeakPixel(peak, row, 16)) {
          peakRow = row;
          break;
        }
      }
      
      expect(peakRow).toBeGreaterThanOrEqual(6);
      expect(peakRow).toBeLessThanOrEqual(9);
    });

    it('should handle different grid sizes', () => {
      // With 8 rows, peak 255 should be at row 0
      expect(isPeakPixel(255, 0, 8)).toBe(true);
      expect(isPeakPixel(255, 1, 8)).toBe(false);
    });

    it('should only show peak on one row', () => {
      const peak = 200;
      let peakCount = 0;
      
      for (let row = 0; row < 16; row++) {
        if (isPeakPixel(peak, row, 16)) {
          peakCount++;
        }
      }
      
      expect(peakCount).toBe(1);
    });
  });

  describe('getPixelColor', () => {
    it('should return inactive color when frequency is 0', () => {
      expect(getPixelColor(0, 0, 10, 5, 16, 16)).toBe(SPECTRUM_COLORS.INACTIVE);
    });

    it('should return peak color for peak pixels', () => {
      const frequency = 100;
      const peak = 255;
      const peakRow = 0; // Peak 255 is at row 0
      
      expect(getPixelColor(frequency, peak, peakRow, 5, 16, 16)).toBe(SPECTRUM_COLORS.PEAK);
    });

    it('should return frequency-based color when pixel is active', () => {
      const frequency = 255; // High frequency to activate all rows
      const peak = 0; // No peak
      
      // Bottom row (15), low frequency band (column 0-4)
      expect(getPixelColor(frequency, peak, 15, 0, 16, 16)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(getPixelColor(frequency, peak, 15, 4, 16, 16)).toBe(SPECTRUM_COLORS.LOW_FREQ);
      
      // Bottom row, mid frequency band (column 6-10)
      expect(getPixelColor(frequency, peak, 15, 6, 16, 16)).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(getPixelColor(frequency, peak, 15, 10, 16, 16)).toBe(SPECTRUM_COLORS.MID_FREQ);
      
      // Bottom row, high frequency band (column 11-15)
      expect(getPixelColor(frequency, peak, 15, 11, 16, 16)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
      expect(getPixelColor(frequency, peak, 15, 15, 16, 16)).toBe(SPECTRUM_COLORS.HIGH_FREQ);
    });

    it('should prioritize peak color over frequency color', () => {
      const frequency = 255;
      const peak = 255;
      const peakRow = 0;
      
      // Even in low frequency band, peak should show white
      expect(getPixelColor(frequency, peak, peakRow, 0, 16, 16)).toBe(SPECTRUM_COLORS.PEAK);
    });

    it('should create correct visualization gradient', () => {
      const frequency = 128;
      const peak = 0;
      const column = 0; // Low frequency band
      
      // Count active pixels from bottom to top
      let activePixels = 0;
      for (let row = 0; row < 16; row++) {
        const color = getPixelColor(frequency, peak, row, column, 16, 16);
        if (color === SPECTRUM_COLORS.LOW_FREQ) {
          activePixels++;
        }
      }
      
      // Should have some active pixels but not all
      expect(activePixels).toBeGreaterThan(3);
      expect(activePixels).toBeLessThan(13);
    });

    it('should show different colors across frequency bands', () => {
      const frequency = 255; // High enough to activate all rows
      const peak = 0;
      const row = 15; // Bottom row
      
      const lowFreqColor = getPixelColor(frequency, peak, row, 0, 16, 16);
      const midFreqColor = getPixelColor(frequency, peak, row, 7, 16, 16);
      const highFreqColor = getPixelColor(frequency, peak, row, 13, 16, 16);
      
      expect(lowFreqColor).toBe(SPECTRUM_COLORS.LOW_FREQ);
      expect(midFreqColor).toBe(SPECTRUM_COLORS.MID_FREQ);
      expect(highFreqColor).toBe(SPECTRUM_COLORS.HIGH_FREQ);
      
      // All should be different
      expect(lowFreqColor).not.toBe(midFreqColor);
      expect(midFreqColor).not.toBe(highFreqColor);
      expect(lowFreqColor).not.toBe(highFreqColor);
    });
  });

  describe('Integration scenarios', () => {
    it('should visualize silent audio correctly', () => {
      const frequencies = new Uint8Array(16).fill(0);
      const peaks = new Uint8Array(16).fill(0);
      
      // All pixels should be inactive
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 16; col++) {
          const color = getPixelColor(frequencies[col], peaks[col], row, col, 16, 16);
          expect(color).toBe(SPECTRUM_COLORS.INACTIVE);
        }
      }
    });

    it('should visualize loud audio correctly', () => {
      const frequencies = new Uint8Array(16).fill(255);
      const peaks = new Uint8Array(16).fill(255);
      
      // Top row should show peaks in white
      for (let col = 0; col < 16; col++) {
        const color = getPixelColor(frequencies[col], peaks[col], 0, col, 16, 16);
        expect(color).toBe(SPECTRUM_COLORS.PEAK);
      }
      
      // Bottom row should show frequency colors
      for (let col = 0; col < 16; col++) {
        const color = getPixelColor(frequencies[col], peaks[col], 15, col, 16, 16);
        expect(color).not.toBe(SPECTRUM_COLORS.INACTIVE);
        expect(color).not.toBe(SPECTRUM_COLORS.PEAK);
      }
    });

    it('should visualize speech-like patterns', () => {
      // Simulate speech: stronger in mid frequencies
      const frequencies = new Uint8Array(16);
      frequencies[0] = 50;  // Low: quiet
      frequencies[5] = 150; // Mid: louder
      frequencies[10] = 150; // Mid: louder
      frequencies[15] = 30;  // High: quiet
      
      const peaks = new Uint8Array(16).fill(0);
      
      // Mid frequencies should light up more rows
      let midActiveRows = 0;
      let lowActiveRows = 0;
      
      for (let row = 0; row < 16; row++) {
        if (getPixelColor(frequencies[5], peaks[5], row, 5, 16, 16) !== SPECTRUM_COLORS.INACTIVE) {
          midActiveRows++;
        }
        if (getPixelColor(frequencies[0], peaks[0], row, 0, 16, 16) !== SPECTRUM_COLORS.INACTIVE) {
          lowActiveRows++;
        }
      }
      
      expect(midActiveRows).toBeGreaterThan(lowActiveRows);
    });
  });
});
