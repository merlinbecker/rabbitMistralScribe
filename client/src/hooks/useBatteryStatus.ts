import { useState, useEffect } from 'react';

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
  onchargingchange: ((this: BatteryManager, ev: Event) => any) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => any) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => any) | null;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
}

export interface BatteryStatus {
  level: number; // 0-1 (0% to 100%)
  charging: boolean;
  supported: boolean;
}

/**
 * Hook to get battery status using Battery Status API
 * Primarily for Rabbit R1 device
 */
export function useBatteryStatus(): BatteryStatus {
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>({
    level: 1,
    charging: false,
    supported: false,
  });

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    
    if (!nav.getBattery) {
      // Battery API not supported
      return;
    }

    let battery: BatteryManager | null = null;

    const updateBatteryStatus = (bat: BatteryManager) => {
      setBatteryStatus({
        level: bat.level,
        charging: bat.charging,
        supported: true,
      });
    };

    nav.getBattery().then((bat) => {
      battery = bat;
      updateBatteryStatus(bat);

      // Listen for battery changes
      bat.addEventListener('levelchange', () => updateBatteryStatus(bat));
      bat.addEventListener('chargingchange', () => updateBatteryStatus(bat));
    }).catch((error) => {
      console.warn('Battery Status API error:', error);
    });

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', () => {});
        battery.removeEventListener('chargingchange', () => {});
      }
    };
  }, []);

  return batteryStatus;
}
