import { useEffect, useRef, useState } from 'react';
import { SpectrumAnalyzer, SpectrumData } from '../utils/SpectrumAnalyzer';

interface LEDPixelDisplayProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}

export function LEDPixelDisplay({ isRecording, audioStream }: LEDPixelDisplayProps) {
  const [spectrumData, setSpectrumData] = useState<SpectrumData>({
    frequencies: new Uint8Array(16).fill(0),
    peaks: new Uint8Array(16).fill(0),
    timestamp: 0,
  });
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();
  const spectrumAnalyzerRef = useRef<SpectrumAnalyzer | null>(null);

  useEffect(() => {
    if (!audioStream || !isRecording) {
      // Reset to idle state
      setSpectrumData({
        frequencies: new Uint8Array(16).fill(0),
        peaks: new Uint8Array(16).fill(0),
        timestamp: 0,
      });
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (spectrumAnalyzerRef.current) {
        spectrumAnalyzerRef.current.reset();
      }
      return;
    }

    // Create audio context and analyzer
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create spectrum analyzer instance
    const spectrumAnalyzer = new SpectrumAnalyzer();
    spectrumAnalyzerRef.current = spectrumAnalyzer;
    
    // Initialize with audio context sample rate
    spectrumAnalyzer.initializeWithContext(audioContext.sampleRate);
    
    // Configure Web Audio API analyzer
    const analyser = audioContext.createAnalyser();
    const analyserConfig = spectrumAnalyzer.getAnalyserConfig();
    analyser.fftSize = analyserConfig.fftSize;
    analyser.smoothingTimeConstant = analyserConfig.smoothingTimeConstant;

    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateFrequencyData = (timestamp: number) => {
      if (!analyserRef.current || !spectrumAnalyzerRef.current) return;

      // Check if we should update this frame (FPS limiting)
      if (!spectrumAnalyzerRef.current.shouldUpdateFrame(timestamp)) {
        animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
        return;
      }

      // Get raw FFT data
      analyser.getByteFrequencyData(dataArray);
      
      // Process through spectrum analyzer
      const processedData = spectrumAnalyzerRef.current.processFrequencyData(dataArray, timestamp);
      
      setSpectrumData(processedData);
      animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
    };

    animationFrameRef.current = requestAnimationFrame(updateFrequencyData);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      source.disconnect();
      audioContext.close();
    };
  }, [audioStream, isRecording]);

  // Generate 16x16 grid
  const pixels = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const frequency = spectrumData.frequencies[col];
      const peak = spectrumData.peaks[col];
      const threshold = ((15 - row) / 15) * 255;
      
      let color = '#000000'; // inactive
      
      // Check if this is a peak pixel
      if (peak > 0) {
        const peakRow = Math.floor(((255 - peak) / 255) * 15);
        if (row === peakRow) {
          color = '#FFFFFF'; // Peak indicator - White
        }
      }
      
      // If not a peak pixel, check if pixel should be active based on frequency
      if (color === '#000000' && frequency > threshold) {
        // Determine color based on column (frequency band), not row!
        if (col <= 5) {
          color = '#FF8C00'; // Low frequencies (0-5) - Orange
        } else if (col <= 10) {
          color = '#FFD700'; // Mid frequencies (6-10) - Yellow
        } else {
          color = '#FF4500'; // High frequencies (11-15) - Red
        }
      }
      
      pixels.push(
        <div
          key={`${row}-${col}`}
          className="rounded-sm transition-colors duration-75"
          style={{ backgroundColor: color }}
          data-testid={`led-pixel-${row}-${col}`}
        />
      );
    }
  }

  return (
    <div 
      className="w-full aspect-square max-w-[224px] mx-auto p-1 bg-black rounded-md"
      data-testid="led-display"
    >
      <div className="grid grid-cols-16 grid-rows-16 gap-[1px] w-full h-full">
        {pixels}
      </div>
    </div>
  );
}
