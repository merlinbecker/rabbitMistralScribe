import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playThreeToneMelody, playRecordingStartSound, playRecordingStopSound } from '../client/src/utils/audioFeedback';

// Mock AudioContext
class MockOscillatorNode {
  frequency = { value: 0 };
  type: OscillatorType = 'sine';
  onended: ((this: AudioScheduledSourceNode, ev: Event) => any) | null = null;

  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn((when: number) => {
    // Simulate immediate end for testing
    setTimeout(() => {
      if (this.onended) {
        this.onended.call(this as any, new Event('ended'));
      }
    }, 10);
  });
}

class MockGainNode {
  gain = {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };

  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};

  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

describe('audioFeedback', () => {
  let originalAudioContext: any;
  let originalWebkitAudioContext: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    originalAudioContext = (global as any).AudioContext;
    originalWebkitAudioContext = (global as any).webkitAudioContext;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset the module to clear singleton AudioContext instance
    vi.resetModules();
  });

  afterEach(() => {
    (global as any).AudioContext = originalAudioContext;
    (global as any).webkitAudioContext = originalWebkitAudioContext;
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('playThreeToneMelody', () => {
    it('should complete without throwing errors', async () => {
      const mockContext = new MockAudioContext();
      (global as any).AudioContext = vi.fn(() => mockContext);

      await expect(playThreeToneMelody()).resolves.not.toThrow();
    });

    it('should handle missing AudioContext gracefully', async () => {
      delete (global as any).AudioContext;
      delete (global as any).webkitAudioContext;

      await expect(playThreeToneMelody()).resolves.not.toThrow();
    });

    it('should not throw on audio errors', async () => {
      const mockContext = new MockAudioContext();
      mockContext.createOscillator = vi.fn(() => {
        throw new Error('Audio error');
      });
      (global as any).AudioContext = vi.fn(() => mockContext);

      await expect(playThreeToneMelody()).resolves.not.toThrow();
    });
  });

  describe('playRecordingStartSound', () => {
    it('should not throw on errors', async () => {
      await expect(playRecordingStartSound()).resolves.not.toThrow();
    });

    it('should handle missing AudioContext', async () => {
      delete (global as any).AudioContext;
      await expect(playRecordingStartSound()).resolves.not.toThrow();
    });
  });

  describe('playRecordingStopSound', () => {
    it('should not throw on errors', async () => {
      await expect(playRecordingStopSound()).resolves.not.toThrow();
    });

    it('should handle missing AudioContext', async () => {
      delete (global as any).AudioContext;
      await expect(playRecordingStopSound()).resolves.not.toThrow();
    });
  });
});
