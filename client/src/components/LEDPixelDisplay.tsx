import { useEffect, useRef, useState } from 'react';

interface LEDPixelDisplayProps {
  isRecording: boolean;
  audioStream: MediaStream | null;
}

export function LEDPixelDisplay({ isRecording, audioStream }: LEDPixelDisplayProps) {
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(16).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!audioStream || !isRecording) {
      // Reset to idle state
      setFrequencyData(new Uint8Array(16).fill(0));
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateFrequencyData = () => {
      if (!analyserRef.current) return;

      analyser.getByteFrequencyData(dataArray);
      
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
      
      setFrequencyData(columnData);
      animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
    };

    updateFrequencyData();

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
      const frequency = frequencyData[col];
      const threshold = ((15 - row) / 15) * 255;
      
      let color = '#000000'; // inactive
      
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
