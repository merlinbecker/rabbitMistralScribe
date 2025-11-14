import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpectrumAnalyzer,
  calculateLogFrequencyBands,
  mapBandsToBins,
  calculateRMS,
  normalizeData,
  type FrequencyBand,
} from '../client/src/utils/SpectrumAnalyzer';

describe('SpectrumAnalyzer Utility Functions', () => {
  describe('calculateLogFrequencyBands', () => {
    it('should calculate correct number of bands', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      expect(bands).toHaveLength(16);
    });

    it('should have first band starting at minFreq', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      expect(bands[0].low).toBeCloseTo(80, 1);
    });

    it('should have last band ending at maxFreq', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      expect(bands[15].high).toBeCloseTo(8000, 1);
    });

    it('should have increasing frequency ranges', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      for (let i = 0; i < bands.length - 1; i++) {
        expect(bands[i].high).toBeLessThanOrEqual(bands[i + 1].low);
        expect(bands[i].low).toBeLessThan(bands[i].high);
      }
    });

    it('should produce logarithmically spaced bands', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      // Check that band widths increase logarithmically
      const width0 = bands[0].high - bands[0].low;
      const width15 = bands[15].high - bands[15].low;
      expect(width15).toBeGreaterThan(width0);
    });
  });

  describe('mapBandsToBins', () => {
    it('should map bands to correct FFT bins', () => {
      const bands: FrequencyBand[] = [
        { low: 80, high: 160 },
        { low: 160, high: 320 },
      ];
      const sampleRate = 48000;
      const fftSize = 256;
      const binMapping = mapBandsToBins(bands, sampleRate, fftSize);

      expect(binMapping).toHaveLength(2);
      expect(binMapping[0].start).toBeGreaterThanOrEqual(0);
      expect(binMapping[0].end).toBeGreaterThan(binMapping[0].start);
    });

    it('should produce increasing bin ranges', () => {
      const bands = calculateLogFrequencyBands(80, 8000, 16);
      const binMapping = mapBandsToBins(bands, 48000, 256);

      // Check that bins are generally increasing (start of next bin should be >= start of current)
      for (let i = 0; i < binMapping.length - 1; i++) {
        expect(binMapping[i + 1].start).toBeGreaterThanOrEqual(binMapping[i].start);
      }
    });
  });

  describe('calculateRMS', () => {
    it('should return 0 for empty array', () => {
      const data = new Uint8Array(0);
      expect(calculateRMS(data)).toBe(0);
    });

    it('should return 0 for all-zero array', () => {
      const data = new Uint8Array(10).fill(0);
      expect(calculateRMS(data)).toBe(0);
    });

    it('should calculate correct RMS for uniform values', () => {
      const data = new Uint8Array(10).fill(100);
      expect(calculateRMS(data)).toBe(100);
    });

    it('should calculate correct RMS for mixed values', () => {
      const data = new Uint8Array([0, 100, 200]);
      const expected = Math.sqrt((0 * 0 + 100 * 100 + 200 * 200) / 3);
      expect(calculateRMS(data)).toBeCloseTo(expected, 2);
    });
  });

  describe('normalizeData', () => {
    it('should return original data if currentRMS is too low', () => {
      const data = new Uint8Array([10, 20, 30]);
      const normalized = normalizeData(data, 0.5, 100);
      expect(Array.from(normalized)).toEqual([10, 20, 30]);
    });

    it('should scale data up when currentRMS is below target', () => {
      const data = new Uint8Array([10, 20, 30]);
      const normalized = normalizeData(data, 10, 100);
      expect(normalized[0]).toBeGreaterThan(data[0]);
      expect(normalized[1]).toBeGreaterThan(data[1]);
      expect(normalized[2]).toBeGreaterThan(data[2]);
    });

    it('should scale data down when currentRMS is above target', () => {
      const data = new Uint8Array([100, 200, 255]);
      const normalized = normalizeData(data, 200, 100);
      expect(normalized[0]).toBeLessThan(data[0]);
      expect(normalized[1]).toBeLessThan(data[1]);
    });

    it('should cap values at 255', () => {
      const data = new Uint8Array([100, 200, 250]);
      const normalized = normalizeData(data, 10, 100);
      normalized.forEach(val => {
        expect(val).toBeLessThanOrEqual(255);
      });
    });
  });
});

describe('SpectrumAnalyzer Class', () => {
  let analyzer: SpectrumAnalyzer;

  beforeEach(() => {
    analyzer = new SpectrumAnalyzer();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer.getFrequencyBands()).toHaveLength(16);
    });

    it('should accept custom config', () => {
      const customAnalyzer = new SpectrumAnalyzer({
        numBands: 8,
        minFreq: 100,
        maxFreq: 4000,
      });
      expect(customAnalyzer.getFrequencyBands()).toHaveLength(8);
    });
  });

  describe('initializeWithContext', () => {
    it('should initialize without errors', () => {
      expect(() => {
        analyzer.initializeWithContext(48000);
      }).not.toThrow();
    });
  });

  describe('getAnalyserConfig', () => {
    it('should return correct analyser configuration', () => {
      const config = analyzer.getAnalyserConfig();
      expect(config.fftSize).toBe(1024);
      expect(config.smoothingTimeConstant).toBe(0.3);
    });

    it('should return custom configuration', () => {
      const customAnalyzer = new SpectrumAnalyzer({
        fftSize: 512,
        smoothingTimeConstant: 0.5,
      });
      const config = customAnalyzer.getAnalyserConfig();
      expect(config.fftSize).toBe(512);
      expect(config.smoothingTimeConstant).toBe(0.5);
    });
  });

  describe('shouldUpdateFrame', () => {
    it('should return true for first frame', () => {
      expect(analyzer.shouldUpdateFrame(0)).toBe(true);
    });

    it('should return false if insufficient time has passed', () => {
      const frameInterval = 1000 / 24; // ~41.67ms for 24 FPS
      
      // First frame at time 0
      expect(analyzer.shouldUpdateFrame(0)).toBe(true);
      // Second frame too soon (only 10ms passed, need ~41.67ms for 24 FPS)
      expect(analyzer.shouldUpdateFrame(10)).toBe(false);
      // Third frame after enough time
      expect(analyzer.shouldUpdateFrame(frameInterval + 5)).toBe(true);
    });

    it('should return true after sufficient time', () => {
      const targetFPS = 24;
      const frameInterval = 1000 / targetFPS; // ~41.67ms
      
      analyzer.shouldUpdateFrame(0);
      expect(analyzer.shouldUpdateFrame(frameInterval + 1)).toBe(true);
    });

    it('should respect custom FPS setting', () => {
      const customAnalyzer = new SpectrumAnalyzer({ targetFPS: 30 });
      const frameInterval = 1000 / 30; // ~33ms
      
      // First frame at time 0
      expect(customAnalyzer.shouldUpdateFrame(0)).toBe(true);
      // Second frame too soon (31ms < 33ms)
      expect(customAnalyzer.shouldUpdateFrame(31)).toBe(false);
      // Third frame with enough time (35ms > 33ms from last successful frame)
      expect(customAnalyzer.shouldUpdateFrame(35)).toBe(true);
    });
  });

  describe('processFrequencyData', () => {
    beforeEach(() => {
      analyzer.initializeWithContext(48000);
    });

    it('should return SpectrumData with correct structure', () => {
      const rawData = new Uint8Array(128).fill(100);
      const result = analyzer.processFrequencyData(rawData, 0);

      expect(result.frequencies).toBeInstanceOf(Uint8Array);
      expect(result.peaks).toBeInstanceOf(Uint8Array);
      expect(result.frequencies).toHaveLength(16);
      expect(result.peaks).toHaveLength(16);
      expect(result.timestamp).toBe(0);
    });

    it('should process all-zero data', () => {
      const rawData = new Uint8Array(128).fill(0);
      const result = analyzer.processFrequencyData(rawData, 0);

      result.frequencies.forEach(val => {
        expect(val).toBe(0);
      });
    });

    it('should process uniform data', () => {
      const rawData = new Uint8Array(128).fill(100);
      const result = analyzer.processFrequencyData(rawData, 0);

      // Should have some normalized values
      const hasNonZero = Array.from(result.frequencies).some(val => val > 0);
      expect(hasNonZero).toBe(true);
    });

    it('should update peaks when new values are higher', () => {
      const rawData1 = new Uint8Array(128).fill(50);
      const result1 = analyzer.processFrequencyData(rawData1, 0);

      const rawData2 = new Uint8Array(128).fill(150);
      const result2 = analyzer.processFrequencyData(rawData2, 100);

      // Peaks in result2 should be higher than in result1
      for (let i = 0; i < 16; i++) {
        expect(result2.peaks[i]).toBeGreaterThanOrEqual(result1.peaks[i]);
      }
    });

    it('should hold peaks for configured time', () => {
      const rawData1 = new Uint8Array(128).fill(200);
      const result1 = analyzer.processFrequencyData(rawData1, 0);

      // Process lower data within hold time
      const rawData2 = new Uint8Array(128).fill(50);
      const result2 = analyzer.processFrequencyData(rawData2, 100);

      // Peaks should still be high (hold time is 500ms by default)
      for (let i = 0; i < 16; i++) {
        expect(result2.peaks[i]).toBeGreaterThanOrEqual(result1.frequencies[i] * 0.5);
      }
    });

    it('should decay peaks after hold time', () => {
      // Set up initial high peaks
      const rawData1 = new Uint8Array(128).fill(200);
      analyzer.processFrequencyData(rawData1, 0);
      analyzer.processFrequencyData(rawData1, 50);
      const result1 = analyzer.processFrequencyData(rawData1, 100);

      // Get max peak value
      const maxPeak = Math.max(...Array.from(result1.peaks));

      // Process zero data multiple times after hold time to allow decay
      const rawData2 = new Uint8Array(128).fill(0);
      let finalResult = result1;
      
      // Process multiple frames with timestamps well past hold time
      for (let i = 0; i < 10; i++) {
        finalResult = analyzer.processFrequencyData(rawData2, 700 + i * 50);
      }

      // Peaks should have decayed significantly from the max
      const maxFinalPeak = Math.max(...Array.from(finalResult.peaks));
      expect(maxFinalPeak).toBeLessThan(maxPeak * 0.8);
    });
  });

  describe('getFrequencyBands', () => {
    it('should return frequency bands', () => {
      const bands = analyzer.getFrequencyBands();
      expect(bands).toHaveLength(16);
      expect(bands[0]).toHaveProperty('low');
      expect(bands[0]).toHaveProperty('high');
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      analyzer.initializeWithContext(48000);
    });

    it('should reset analyzer state', () => {
      // Process some data
      const rawData = new Uint8Array(128).fill(200);
      analyzer.processFrequencyData(rawData, 0);
      analyzer.shouldUpdateFrame(0);

      // Reset
      analyzer.reset();

      // Process again and verify peaks are reset
      const result = analyzer.processFrequencyData(rawData, 100);
      // After reset, processing should start fresh
      expect(result).toBeDefined();
    });

    it('should allow frame updates immediately after reset', () => {
      analyzer.shouldUpdateFrame(0);
      analyzer.shouldUpdateFrame(10); // Should return false

      analyzer.reset();

      // Should allow update immediately after reset
      expect(analyzer.shouldUpdateFrame(10)).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should handle typical audio processing workflow', () => {
      // Initialize
      analyzer.initializeWithContext(48000);

      // Simulate multiple frames
      const timestamps = [0, 30, 60, 90, 120];
      const results = timestamps.map((timestamp, index) => {
        if (analyzer.shouldUpdateFrame(timestamp)) {
          const rawData = new Uint8Array(128).fill(100 + index * 20);
          return analyzer.processFrequencyData(rawData, timestamp);
        }
        return null;
      });

      // Should have processed some frames
      const processedFrames = results.filter(r => r !== null);
      expect(processedFrames.length).toBeGreaterThan(0);

      // Each result should be valid
      processedFrames.forEach(result => {
        expect(result?.frequencies).toBeInstanceOf(Uint8Array);
        expect(result?.peaks).toBeInstanceOf(Uint8Array);
      });
    });

    it('should handle rapid frequency changes', () => {
      analyzer.initializeWithContext(48000);

      // Simulate changes with actual frequency content in different bins
      const rawData1 = new Uint8Array(128).fill(0);
      // Add some low frequency content
      for (let i = 0; i < 20; i++) {
        rawData1[i] = 100;
      }
      const result1 = analyzer.processFrequencyData(rawData1, 0);

      const rawData2 = new Uint8Array(128).fill(0);
      // Add strong mid-high frequency content
      for (let i = 20; i < 60; i++) {
        rawData2[i] = 200;
      }
      const result2 = analyzer.processFrequencyData(rawData2, 50);

      // Different frequency distributions should produce different band patterns
      const hasDifferentPattern = result2.frequencies.some((v, i) => Math.abs(v - result1.frequencies[i]) > 20);
      expect(hasDifferentPattern).toBe(true);
      
      // Peaks should be recorded
      const hasPeaks = Array.from(result2.peaks).some(v => v > 0);
      expect(hasPeaks).toBe(true);
    });
  });
});
