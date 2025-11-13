/**
 * Color utilities for spectrum visualization
 * 
 * Colors are mapped to frequency bands, not amplitude levels:
 * - Low frequencies (0-5): Orange (#FF8C00)
 * - Mid frequencies (6-10): Yellow (#FFD700)
 * - High frequencies (11-15): Red (#FF4500)
 * - Peak indicator: White (#FFFFFF)
 */

export const SPECTRUM_COLORS = {
  LOW_FREQ: '#FF8C00',    // Orange - for bass/low frequencies
  MID_FREQ: '#FFD700',    // Yellow - for mid frequencies
  HIGH_FREQ: '#FF4500',   // Red - for high frequencies/treble
  PEAK: '#FFFFFF',        // White - for peak indicators
  INACTIVE: '#000000',    // Black - for inactive pixels
} as const;

/**
 * Get the color for a specific frequency band (column)
 * Based on the frequency band, not the amplitude (row)
 */
export function getColorForFrequencyBand(column: number, numColumns: number = 16): string {
  // Map columns to frequency ranges
  // Column 0-5: Low frequencies (Orange)
  // Column 6-10: Mid frequencies (Yellow)
  // Column 11-15: High frequencies (Red)
  
  const lowThreshold = Math.floor(numColumns * 0.33);   // ~5 for 16 columns
  const midThreshold = Math.floor(numColumns * 0.67);   // ~11 for 16 columns
  
  if (column <= lowThreshold) {
    return SPECTRUM_COLORS.LOW_FREQ;
  } else if (column <= midThreshold) {
    return SPECTRUM_COLORS.MID_FREQ;
  } else {
    return SPECTRUM_COLORS.HIGH_FREQ;
  }
}

/**
 * Determine if a pixel should be lit based on amplitude threshold
 * Row 0 is at the top (highest amplitude), row 15 is at the bottom (lowest amplitude)
 */
export function shouldPixelBeActive(
  frequency: number,
  row: number,
  numRows: number = 16
): boolean {
  // Threshold increases from bottom to top
  // Row 15 (bottom): threshold = (15/15) * 255 = 255 (shows only max values)
  // Row 0 (top): threshold = (0/15) * 255 = 0 (shows all values)
  const threshold = ((numRows - 1 - row) / (numRows - 1)) * 255;
  return frequency > threshold;
}

/**
 * Check if a pixel should show the peak indicator
 * Peak is shown only at the exact row that matches the peak value
 */
export function isPeakPixel(
  peak: number,
  row: number,
  numRows: number = 16
): boolean {
  if (peak === 0) return false;
  
  // Calculate which row the peak corresponds to
  const peakRow = Math.floor(((255 - peak) / 255) * (numRows - 1));
  return row === peakRow;
}

/**
 * Get the final color for a pixel considering frequency, amplitude, and peak
 */
export function getPixelColor(
  frequency: number,
  peak: number,
  row: number,
  column: number,
  numRows: number = 16,
  numColumns: number = 16
): string {
  // Check if this pixel shows the peak indicator
  if (isPeakPixel(peak, row, numRows)) {
    return SPECTRUM_COLORS.PEAK;
  }
  
  // Check if pixel should be active based on amplitude
  if (shouldPixelBeActive(frequency, row, numRows)) {
    return getColorForFrequencyBand(column, numColumns);
  }
  
  return SPECTRUM_COLORS.INACTIVE;
}
