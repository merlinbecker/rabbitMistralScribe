/**
 * AudioSpectrumBitmap - Provides audio frequency visualization
 */

import type { LEDBitmap } from '../types';

export class AudioSpectrumBitmap {
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(16).fill(0);
  private isActive: boolean = false;
  
  constructor(
    private audioStream: MediaStream | null,
    private isRecording: boolean
  ) {}
  
  /**
   * Start audio analysis
   */
  start(): void {
    if (!this.audioStream || !this.isRecording || this.isActive) {
      return;
    }
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      this.source = this.audioContext.createMediaStreamSource(this.audioStream);
      this.source.connect(this.analyser);
      
      this.isActive = true;
    } catch (error) {
      console.error('Failed to start audio analysis:', error);
      this.stop();
    }
  }
  
  /**
   * Stop audio analysis and cleanup
   */
  stop(): void {
    if (!this.isActive) return;
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.frequencyData = new Uint8Array(16).fill(0);
    this.isActive = false;
  }
  
  /**
   * Update frequency data from analyser
   */
  private updateFrequencyData(): void {
    if (!this.analyser || !this.isActive) {
      this.frequencyData = new Uint8Array(16).fill(0);
      return;
    }
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Average frequency data into 16 columns
    const columnData = new Uint8Array(16);
    const binSize = Math.floor(bufferLength / 16);
    
    for (let i = 0; i < 16; i++) {
      const start = i * binSize;
      const end = start + binSize;
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += dataArray[j];
      }
      columnData[i] = Math.floor(sum / binSize);
    }
    
    this.frequencyData = columnData;
  }
  
  /**
   * Get current bitmap representation
   */
  getBitmap(): LEDBitmap {
    // Update frequency data
    this.updateFrequencyData();
    
    const bitmap: LEDBitmap = [];
    
    for (let row = 0; row < 16; row++) {
      bitmap[row] = [];
      for (let col = 0; col < 16; col++) {
        const frequency = this.frequencyData[col];
        const threshold = ((15 - row) / 15) * 255;
        
        let color = '#000000';
        if (frequency > threshold) {
          // Determine color based on row position (frequency band)
          if (row < 5) {
            color = '#FF4500'; // High frequency - Red
          } else if (row < 11) {
            color = '#FFD700'; // Mid frequency - Yellow
          } else {
            color = '#FF8C00'; // Low frequency - Orange
          }
        }
        
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
}
