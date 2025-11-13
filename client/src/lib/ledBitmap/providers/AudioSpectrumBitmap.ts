
/**
 * AudioSpectrumBitmap - Provides audio frequency visualization
 * Uses SpectrumAnalyzer for optimized speech-frequency analysis
 */

import type { LEDBitmap } from '../types';
import { SpectrumAnalyzer } from '../../../utils/SpectrumAnalyzer';
import { getPixelColor } from '../../../utils/spectrumColors';

export class AudioSpectrumBitmap {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private spectrumAnalyzer: SpectrumAnalyzer;
  private isActive: boolean = false;
  private animationFrameId: number | null = null;
  private currentFrequencies: Uint8Array = new Uint8Array(16).fill(0);
  private currentPeaks: Uint8Array = new Uint8Array(16).fill(0);
  
  constructor(
    private audioStream: MediaStream | null,
    private isRecording: boolean
  ) {
    // Initialize SpectrumAnalyzer with dynamic gain and better frequency resolution
    this.spectrumAnalyzer = new SpectrumAnalyzer({
      numBands: 16,
      minFreq: 50,      // Lower speech frequencies
      maxFreq: 1000,    // Extended range to 1kHz
      targetFPS: 12,    // Lower framerate for performance
      fftSize: 1024,    // Higher FFT for better frequency differentiation
      smoothingTimeConstant: 0.3,  // Less smoothing for sharper response
      targetRMS: 100,
      peakHoldTime: 300,
      peakDecayRate: 0.92,
    });
  }
  
  /**
   * Start audio analysis with animation loop
   */
  start(): void {
    if (!this.audioStream || !this.isRecording || this.isActive) {
      return;
    }
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyser with SpectrumAnalyzer settings
      const config = this.spectrumAnalyzer.getAnalyserConfig();
      this.analyser.fftSize = config.fftSize;
      this.analyser.smoothingTimeConstant = config.smoothingTimeConstant;
      
      // Initialize SpectrumAnalyzer with audio context sample rate
      this.spectrumAnalyzer.initializeWithContext(this.audioContext.sampleRate);
      
      this.source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.source.connect(this.analyser);
      
      this.isActive = true;
      this.startAnalysisLoop();
    } catch (error) {
      console.error('Failed to start audio analysis:', error);
      this.stop();
    }
  }
  
  /**
   * Animation loop for continuous frequency analysis
   */
  private startAnalysisLoop(): void {
    const updateFrame = (timestamp: number) => {
      if (!this.isActive) return;
      
      // Check if we should update this frame (FPS limiting)
      if (this.analyser && this.spectrumAnalyzer.shouldUpdateFrame(timestamp)) {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        // Process with SpectrumAnalyzer
        const result = this.spectrumAnalyzer.processFrequencyData(dataArray, timestamp);
        
        // Store current data
        this.currentFrequencies = result.frequencies;
        this.currentPeaks = result.peaks;
      }
      
      this.animationFrameId = requestAnimationFrame(updateFrame);
    };
    
    this.animationFrameId = requestAnimationFrame(updateFrame);
  }
  
  /**
   * Stop audio analysis and cleanup
   */
  stop(): void {
    if (!this.isActive) return;
    
    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.spectrumAnalyzer.reset();
    this.currentFrequencies = new Uint8Array(16).fill(0);
    this.currentPeaks = new Uint8Array(16).fill(0);
    this.isActive = false;
  }
  
  /**
   * Get current bitmap representation
   * Uses correct frequency-to-color mapping (columns = frequency bands)
   */
  getBitmap(): LEDBitmap {
    const bitmap: LEDBitmap = [];
    const numRows = 16;
    const numCols = 16;
    
    for (let row = 0; row < numRows; row++) {
      bitmap[row] = [];
      for (let col = 0; col < numCols; col++) {
        const frequency = this.currentFrequencies[col];
        const peak = this.currentPeaks[col];
        
        // Use spectrumColors utility for correct color mapping
        const color = getPixelColor(frequency, peak, row, col, numRows, numCols);
        
        bitmap[row][col] = { color };
      }
    }
    
    return bitmap;
  }
  
  /**
   * Check if currently active
   */
  isRunning(): boolean {
    return this.isActive;
  }
  
  /**
   * Get frequency bands information for debugging
   */
  getFrequencyBands() {
    return this.spectrumAnalyzer.getFrequencyBands();
  }
}
