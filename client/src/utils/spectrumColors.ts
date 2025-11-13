/**
 * Color utilities for spectrum visualization
 *
 * Colors represent amplitude (loudness), not frequency:
 * - Rows (vertical): Amplitude determines color (quiet=green, mid=yellow, loud=red)
 * - Columns (horizontal): Frequency bands (all same color based on amplitude)
 */

export const SPECTRUM_COLORS = {
  INACTIVE: '#000000',    // Black - for inactive pixels
} as const;

/**
 * Get color based on amplitude (row position)
 * Bottom rows (quiet) = Green
 * Middle rows (medium) = Yellow
 * Top rows (loud) = Red
 */
export function getColorForAmplitude(row: number, numRows: number = 16): string {
  // Inverted: row 0 is top (loudest), row 15 is bottom (quietest)
  const normalizedRow = row / (numRows - 1); // 0 (top/loud) to 1 (bottom/quiet)

  if (normalizedRow < 0.33) {
    // Top third: Red (loudest)
    return '#FF4500';
  } else if (normalizedRow < 0.67) {
    // Middle third: Yellow
    return '#FFD700';
  } else {
    // Bottom third: Green (quietest)
    return '#00FF00';
  }
}

/**
 * Determine if a pixel should be lit based on amplitude threshold
 * Applies -3dB attenuation to filter out quiet signals
 * Larger dynamic range for better visualization
 */
export function shouldPixelBeActive(
  frequency: number,
  row: number,
  numRows: number = 16
): boolean {
  // Apply -3dB attenuation (approximately 0.707 factor)
  const attenuatedFrequency = frequency * 0.707;
  
  // Expanded threshold range for better dynamic range
  const normalizedRow = (numRows - 1 - row) / (numRows - 1); // 0 (top) to 1 (bottom)
  const threshold = normalizedRow * 200; // Wider range

  return attenuatedFrequency > threshold;
}

/**
 * Get the final color for a pixel
 * Color is determined by row (amplitude), not column (frequency)
 */
export function getPixelColor(
  frequency: number,
  peak: number,
  row: number,
  column: number,
  numRows: number = 16,
  numColumns: number = 16
): string {
  // Check if pixel should be active based on amplitude
  if (shouldPixelBeActive(frequency, row, numRows)) {
    // Color based on row (amplitude), not column (frequency)
    return getColorForAmplitude(row, numRows);
  }

  return SPECTRUM_COLORS.INACTIVE;
}