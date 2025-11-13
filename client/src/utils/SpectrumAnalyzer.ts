/**
 * SpectrumAnalyzer - Utility class for audio spectrum analysis
 * 
 * This class encapsulates all audio analysis logic for the LED Pixel Display,
 * providing optimized frequency analysis focused on speech-relevant frequencies (80-8000 Hz).
 */

export interface SpectrumConfig {
  /** Number of frequency bands to output (default: 16) */
  numBands?: number;
  /** Minimum frequency in Hz (default: 80) */
  minFreq?: number;
  /** Maximum frequency in Hz (default: 8000) */
  maxFreq?: number;
  /** Target FPS for updates (default: 40) */
  targetFPS?: number;
  /** FFT size for analyzer (default: 256) */
  fftSize?: number;
  /** Smoothing constant for analyzer (default: 0.6) */
  smoothingTimeConstant?: number;
  /** Target RMS value for normalization (default: 100) */
  targetRMS?: number;
  /** Peak hold time in milliseconds (default: 500) */
  peakHoldTime?: number;
  /** Peak decay rate per frame (default: 0.95) */
  peakDecayRate?: number;
}

export interface FrequencyBand {
  low: number;
  high: number;
}

export interface SpectrumData {
  /** Normalized frequency data for each band (0-255) */
  frequencies: Uint8Array;
  /** Peak values for each band (0-255) */
  peaks: Uint8Array;
  /** Timestamp of the data */
  timestamp: number;
}

/**
 * Calculate logarithmically spaced frequency bands
 * This provides better resolution for speech frequencies
 */
export function calculateLogFrequencyBands(
  minFreq: number,
  maxFreq: number,
  numBands: number
): FrequencyBand[] {
  const bands: FrequencyBand[] = [];
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);
  const logStep = (logMax - logMin) / numBands;

  for (let i = 0; i < numBands; i++) {
    const freqLow = Math.exp(logMin + i * logStep);
    const freqHigh = Math.exp(logMin + (i + 1) * logStep);
    bands.push({ low: freqLow, high: freqHigh });
  }

  return bands;
}

/**
 * Map frequency bands to FFT bins
 */
export function mapBandsToBins(
  bands: FrequencyBand[],
  sampleRate: number,
  fftSize: number
): { start: number; end: number }[] {
  const binWidth = sampleRate / fftSize;
  
  return bands.map(band => {
    const startBin = Math.floor(band.low / binWidth);
    const endBin = Math.ceil(band.high / binWidth);
    return { start: startBin, end: endBin };
  });
}

/**
 * Calculate RMS (Root Mean Square) of an array
 */
export function calculateRMS(data: Uint8Array): number {
  if (data.length === 0) return 0;
  
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    sumSquares += data[i] * data[i];
  }
  
  return Math.sqrt(sumSquares / data.length);
}

/**
 * Normalize frequency data using RMS-based gain adjustment
 */
export function normalizeData(
  data: Uint8Array,
  currentRMS: number,
  targetRMS: number
): Uint8Array {
  if (currentRMS < 1) return data; // Avoid division by zero
  
  const gain = targetRMS / currentRMS;
  const normalized = new Uint8Array(data.length);
  
  for (let i = 0; i < data.length; i++) {
    normalized[i] = Math.min(255, Math.floor(data[i] * gain));
  }
  
  return normalized;
}

/**
 * Normalize with soft compression to prevent overdriving
 * Uses logarithmic compression for values above threshold
 */
export function normalizeDataWithCompression(
  data: Uint8Array,
  currentRMS: number,
  targetRMS: number
): Uint8Array {
  if (currentRMS < 1) return data;
  
  const gain = Math.min(3.0, targetRMS / currentRMS); // Limit max gain to 3x
  const normalized = new Uint8Array(data.length);
  const compressionThreshold = 180; // Start compressing above this value
  
  for (let i = 0; i < data.length; i++) {
    const amplified = data[i] * gain;
    
    if (amplified <= compressionThreshold) {
      // Linear below threshold
      normalized[i] = Math.min(255, Math.floor(amplified));
    } else {
      // Soft compression above threshold using logarithmic curve
      const excess = amplified - compressionThreshold;
      const compressed = compressionThreshold + Math.log1p(excess) * 15;
      normalized[i] = Math.min(255, Math.floor(compressed));
    }
  }
  
  return normalized;
}

/**
 * Main SpectrumAnalyzer class
 */
export class SpectrumAnalyzer {
  private config: Required<SpectrumConfig>;
  private frequencyBands: FrequencyBand[];
  private binMapping: { start: number; end: number }[] = [];
  private rmsValue: number = 0;
  private peaks: { value: number; timestamp: number }[] = [];
  private lastFrameTime: number = -1;
  private sampleRate: number = 0;

  constructor(config: SpectrumConfig = {}) {
    this.config = {
      numBands: config.numBands ?? 16,
      minFreq: config.minFreq ?? 80,
      maxFreq: config.maxFreq ?? 800,  // Updated default to 800 Hz
      targetFPS: config.targetFPS ?? 40,
      fftSize: config.fftSize ?? 512,  // Higher FFT for better resolution
      smoothingTimeConstant: config.smoothingTimeConstant ?? 0.7,  // More smoothing
      targetRMS: config.targetRMS ?? 60,  // Lower target to prevent overdriving
      peakHoldTime: config.peakHoldTime ?? 500,
      peakDecayRate: config.peakDecayRate ?? 0.95,
    };

    this.frequencyBands = calculateLogFrequencyBands(
      this.config.minFreq,
      this.config.maxFreq,
      this.config.numBands
    );

    // Initialize peaks
    this.peaks = new Array(this.config.numBands).fill(null).map(() => ({
      value: 0,
      timestamp: 0,
    }));
  }

  /**
   * Initialize the analyzer with audio context information
   */
  initializeWithContext(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.binMapping = mapBandsToBins(
      this.frequencyBands,
      sampleRate,
      this.config.fftSize
    );
  }

  /**
   * Get the configuration for the Web Audio API AnalyserNode
   */
  getAnalyserConfig(): { fftSize: number; smoothingTimeConstant: number } {
    return {
      fftSize: this.config.fftSize,
      smoothingTimeConstant: this.config.smoothingTimeConstant,
    };
  }

  /**
   * Check if enough time has passed for the next frame
   */
  shouldUpdateFrame(timestamp: number): boolean {
    const frameInterval = 1000 / this.config.targetFPS;
    // Always allow first frame (when lastFrameTime is -1)
    // or when enough time has passed
    const timeSinceLastFrame = timestamp - this.lastFrameTime;
    if (timeSinceLastFrame >= frameInterval || this.lastFrameTime === -1) {
      this.lastFrameTime = timestamp;
      return true;
    }
    return false;
  }

  /**
   * Process raw FFT data into frequency bands
   */
  processFrequencyData(rawData: Uint8Array, timestamp: number): SpectrumData {
    // Extract frequency bands from FFT data
    const bandData = new Uint8Array(this.config.numBands);
    
    for (let i = 0; i < this.config.numBands; i++) {
      const mapping = this.binMapping[i];
      let sum = 0;
      let count = 0;
      
      for (let j = mapping.start; j < mapping.end && j < rawData.length; j++) {
        sum += rawData[j];
        count++;
      }
      
      bandData[i] = count > 0 ? Math.floor(sum / count) : 0;
    }

    // Calculate RMS for normalization
    const currentRMS = calculateRMS(bandData);
    
    // Smooth RMS with stronger exponential moving average to prevent flickering
    this.rmsValue = 0.95 * this.rmsValue + 0.05 * currentRMS;
    
    // Use smoothed RMS, but prevent it from going too low
    const effectiveRMS = Math.max(this.rmsValue, 10);

    // Normalize data with dynamic compression
    const normalizedData = normalizeDataWithCompression(bandData, effectiveRMS, this.config.targetRMS);

    // Update peaks
    const peakData = new Uint8Array(this.config.numBands);
    for (let i = 0; i < this.config.numBands; i++) {
      const currentValue = normalizedData[i];
      const peak = this.peaks[i];

      if (currentValue > peak.value) {
        // New peak
        peak.value = currentValue;
        peak.timestamp = timestamp;
      } else if (timestamp - peak.timestamp > this.config.peakHoldTime) {
        // Decay peak
        peak.value = Math.floor(peak.value * this.config.peakDecayRate);
      }

      peakData[i] = peak.value;
    }

    return {
      frequencies: normalizedData,
      peaks: peakData,
      timestamp,
    };
  }

  /**
   * Get frequency band information
   */
  getFrequencyBands(): FrequencyBand[] {
    return this.frequencyBands;
  }

  /**
   * Reset the analyzer state
   */
  reset(): void {
    this.rmsValue = 0;
    this.lastFrameTime = -1;
    this.peaks = new Array(this.config.numBands).fill(null).map(() => ({
      value: 0,
      timestamp: 0,
    }));
  }
}
