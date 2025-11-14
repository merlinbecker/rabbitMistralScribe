/**
 * Audio feedback utilities for Rabbit R1
 * Provides three-tone melody feedback for recording start/stop
 */

interface AudioContextType extends BaseAudioContext {
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

let audioContext: AudioContextType | null = null;

/**
 * Initialize audio context (lazy initialization)
 */
function getAudioContext(): AudioContextType {
  if (!audioContext) {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    audioContext = new AudioContextClass() as AudioContextType;
  }
  return audioContext;
}

/**
 * Play a single tone
 */
async function playTone(frequency: number, duration: number, volume: number = 0.3): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      // Envelope: quick attack, sustain, quick release
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // 10ms attack
      gainNode.gain.setValueAtTime(volume, now + duration - 0.02); // Sustain
      gainNode.gain.linearRampToValueAtTime(0, now + duration); // 20ms release

      oscillator.start(now);
      oscillator.stop(now + duration);

      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
        resolve();
      };
    } catch (error) {
      console.error('Error playing tone:', error);
      resolve(); // Don't block on audio errors
    }
  });
}

/**
 * Play three-tone melody
 * Classic ascending tones: C5 -> E5 -> G5 (major chord)
 */
export async function playThreeToneMelody(): Promise<void> {
  try {
    const ctx = getAudioContext();
    
    // Resume audio context if suspended (required by some browsers)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Three ascending tones forming a C major chord
    const tones = [
      { frequency: 523.25, duration: 0.15 }, // C5
      { frequency: 659.25, duration: 0.15 }, // E5
      { frequency: 783.99, duration: 0.2 },  // G5 (slightly longer)
    ];

    for (const tone of tones) {
      await playTone(tone.frequency, tone.duration);
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms gap between tones
    }
  } catch (error) {
    console.error('Error playing three-tone melody:', error);
    // Silent fail - audio feedback is nice-to-have, not critical
  }
}

/**
 * Play recording start feedback
 */
export async function playRecordingStartSound(): Promise<void> {
  return playThreeToneMelody();
}

/**
 * Play recording stop feedback
 */
export async function playRecordingStopSound(): Promise<void> {
  return playThreeToneMelody();
}
