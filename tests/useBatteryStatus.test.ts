import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBatteryStatus } from '../client/src/hooks/useBatteryStatus';

// Mock BatteryManager
class MockBatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;

  constructor(initialState = { level: 1, charging: false }) {
    super();
    this.level = initialState.level;
    this.charging = initialState.charging;
    this.chargingTime = Infinity;
    this.dischargingTime = Infinity;
  }

  updateLevel(newLevel: number) {
    this.level = newLevel;
    this.dispatchEvent(new Event('levelchange'));
  }

  updateCharging(isCharging: boolean) {
    this.charging = isCharging;
    this.dispatchEvent(new Event('chargingchange'));
  }
}

describe('useBatteryStatus', () => {
  let originalGetBattery: any;

  beforeEach(() => {
    originalGetBattery = (navigator as any).getBattery;
  });

  afterEach(() => {
    if (originalGetBattery) {
      (navigator as any).getBattery = originalGetBattery;
    } else {
      delete (navigator as any).getBattery;
    }
    vi.clearAllMocks();
  });

  it('should return default values when Battery API is not supported', () => {
    // Remove getBattery from navigator
    delete (navigator as any).getBattery;

    const { result } = renderHook(() => useBatteryStatus());

    expect(result.current).toEqual({
      level: 1,
      charging: false,
      supported: false,
    });
  });

  it('should return battery status when API is supported', async () => {
    const mockBattery = new MockBatteryManager({ level: 0.75, charging: false });
    (navigator as any).getBattery = vi.fn().mockResolvedValue(mockBattery);

    const { result } = renderHook(() => useBatteryStatus());

    await waitFor(() => {
      expect(result.current.supported).toBe(true);
      expect(result.current.level).toBe(0.75);
      expect(result.current.charging).toBe(false);
    });
  });

  it('should update when battery level changes', async () => {
    const mockBattery = new MockBatteryManager({ level: 0.5, charging: false });
    (navigator as any).getBattery = vi.fn().mockResolvedValue(mockBattery);

    const { result } = renderHook(() => useBatteryStatus());

    await waitFor(() => {
      expect(result.current.level).toBe(0.5);
    });

    // Simulate battery level change
    mockBattery.updateLevel(0.3);

    await waitFor(() => {
      expect(result.current.level).toBe(0.3);
    });
  });

  it('should update when charging status changes', async () => {
    const mockBattery = new MockBatteryManager({ level: 0.8, charging: false });
    (navigator as any).getBattery = vi.fn().mockResolvedValue(mockBattery);

    const { result } = renderHook(() => useBatteryStatus());

    await waitFor(() => {
      expect(result.current.charging).toBe(false);
    });

    // Start charging
    mockBattery.updateCharging(true);

    await waitFor(() => {
      expect(result.current.charging).toBe(true);
    });
  });

  it('should handle getBattery rejection gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (navigator as any).getBattery = vi.fn().mockRejectedValue(new Error('Battery API error'));

    const { result } = renderHook(() => useBatteryStatus());

    // Should still return default values without crashing
    expect(result.current).toEqual({
      level: 1,
      charging: false,
      supported: false,
    });

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Battery Status API error:',
        expect.any(Error)
      );
    });

    consoleWarnSpy.mockRestore();
  });

  it('should cleanup event listeners on unmount', async () => {
    const mockBattery = new MockBatteryManager({ level: 0.9, charging: true });
    const removeEventListenerSpy = vi.spyOn(mockBattery, 'removeEventListener');
    (navigator as any).getBattery = vi.fn().mockResolvedValue(mockBattery);

    const { unmount } = renderHook(() => useBatteryStatus());

    await waitFor(() => {
      expect(mockBattery.level).toBe(0.9);
    });

    unmount();

    // Note: The current implementation doesn't properly clean up listeners
    // This test documents the expected behavior for future improvement
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
