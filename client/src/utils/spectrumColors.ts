
/**
 * Color utilities for spectrum visualization
 *
 * Colors represent amplitude (loudness), not frequency:
 * - Rows (vertical): Amplitude determines color (quiet to loud gradient)
 * - Columns (horizontal): Frequency bands (all same color based on amplitude)
 */

export const SPECTRUM_COLORS = {
  INACTIVE: '#000000',    // Black - for inactive pixels
} as const;

/**
 * Get color based on amplitude (row position)
 * 5-level gradient from quiet to loud:
 * - Level 1 (quietest): #FFD700 (Gold)
 * - Level 2: #FFAF00 (Orange-Yellow)
 * - Level 3: #FF8205 (Orange)
 * - Level 4: #FA500F (Red-Orange)
 * - Level 5 (loudest): #E10500 (Red)
 */
export function getColorForAmplitude(row: number, numRows: number = 16): string {
  // Inverted: row 0 is top (loudest), row 15 is bottom (quietest)
  const normalizedRow = row / (numRows - 1); // 0 (top/loud) to 1 (bottom/quiet)

  if (normalizedRow < 0.2) {
    // Top 20%: Loudest - Red
    return '#E10500';
  } else if (normalizedRow < 0.4) {
    // 20-40%: Very loud - Red-Orange
    return '#FA500F';
  } else if (normalizedRow < 0.6) {
    // 40-60%: Medium - Orange
    return '#FF8205';
  } else if (normalizedRow < 0.8) {
    // 60-80%: Quiet - Orange-Yellow
    return '#FFAF00';
  } else {
    // Bottom 20%: Quietest - Gold
    return '#FFD700';
  }
}

/**
 * Determine if a pixel should be lit based on amplitude threshold
 * Enhanced for better frequency differentiation
 */
export function shouldPixelBeActive(
  frequency: number,
  row: number,
  numRows: number = 16
): boolean {
  // Better frequency differentiation with sharper threshold
  const normalizedRow = (numRows - 1 - row) / (numRows - 1); // 0 (top) to 1 (bottom)
  const threshold = normalizedRow * 220; // Adjusted for dynamic gain

  return frequency > threshold;
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
