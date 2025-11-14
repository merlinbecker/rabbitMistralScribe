import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStatusNotification, showStatusNotification, dismissStatusNotification, resetStatusNotifications } from '@/hooks/use-status-notification';

describe('useStatusNotification hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStatusNotifications();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetStatusNotifications();
  });

  it('should initialize with no current notification', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    expect(result.current.current).toBeNull();
    expect(result.current.queue).toHaveLength(0);
  });

  it('should show a notification immediately if none is active', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'Test Notification',
        type: 'success',
      });
    });

    expect(result.current.current).toBeTruthy();
    expect(result.current.current?.title).toBe('Test Notification');
    expect(result.current.current?.type).toBe('success');
  });

  it('should queue notifications when one is already showing', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'First Notification',
        type: 'success',
      });
      result.current.notify({
        title: 'Second Notification',
        type: 'info',
      });
    });

    expect(result.current.current?.title).toBe('First Notification');
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0].title).toBe('Second Notification');
  });

  it('should automatically dismiss notification after default duration', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'Temporary Notification',
        type: 'info',
      });
    });

    expect(result.current.current).toBeTruthy();

    // Advance timers by 10 seconds (default duration)
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should be dismissed after timer expires
    expect(result.current.current).toBeNull();
  });

  it('should respect custom duration', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'Quick Notification',
        type: 'info',
        duration: 3000, // 3 seconds
      });
    });

    expect(result.current.current).toBeTruthy();

    // Advance by 2 seconds - should still be showing
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.current).toBeTruthy();

    // Advance by 1 more second - should be dismissed
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.current).toBeNull();
  });

  it('should process next notification in queue after current dismisses', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'First',
        type: 'success',
        duration: 1000,
      });
      result.current.notify({
        title: 'Second',
        type: 'info',
      });
    });

    expect(result.current.current?.title).toBe('First');
    expect(result.current.queue).toHaveLength(1);

    // Advance timer to dismiss first notification
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.current?.title).toBe('Second');
    expect(result.current.queue).toHaveLength(0);
  });

  it('should allow manual dismissal of current notification', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'Dismissible Notification',
        type: 'warning',
      });
    });

    expect(result.current.current).toBeTruthy();

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.current).toBeNull();
  });

  it('should dismiss specific notification by id', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    let notificationId: string;
    act(() => {
      notificationId = result.current.notify({
        title: 'Test Notification',
        type: 'info',
      });
    });

    expect(result.current.current).toBeTruthy();

    act(() => {
      result.current.dismiss(notificationId);
    });

    expect(result.current.current).toBeNull();
  });

  it('should handle different notification types', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    const types = ['success', 'error', 'info', 'warning'] as const;
    
    types.forEach((type) => {
      act(() => {
        result.current.notify({
          title: `${type} notification`,
          type,
        });
      });

      expect(result.current.current?.type).toBe(type);

      act(() => {
        result.current.dismiss();
      });
    });
  });

  it('should include description when provided', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'Title',
        description: 'Detailed description',
        type: 'info',
      });
    });

    expect(result.current.current?.description).toBe('Detailed description');
  });

  it('should work with global showStatusNotification function', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      showStatusNotification({
        title: 'Global Notification',
        type: 'success',
      });
    });

    expect(result.current.current?.title).toBe('Global Notification');
  });

  it('should work with global dismissStatusNotification function', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      showStatusNotification({
        title: 'Global Notification',
        type: 'success',
      });
    });

    expect(result.current.current).toBeTruthy();

    act(() => {
      dismissStatusNotification();
    });

    expect(result.current.current).toBeNull();
  });

  it('should handle multiple queued notifications in order', () => {
    const { result } = renderHook(() => useStatusNotification());
    
    act(() => {
      result.current.notify({
        title: 'First',
        type: 'info',
        duration: 1000,
      });
      result.current.notify({
        title: 'Second',
        type: 'success',
        duration: 1000,
      });
      result.current.notify({
        title: 'Third',
        type: 'warning',
        duration: 1000,
      });
    });

    // First should be showing
    expect(result.current.current?.title).toBe('First');
    expect(result.current.queue).toHaveLength(2);

    // After 1 second, second should be showing
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.current?.title).toBe('Second');
    expect(result.current.queue).toHaveLength(1);

    // After another second, third should be showing
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.current?.title).toBe('Third');
    expect(result.current.queue).toHaveLength(0);

    // After another second, all should be cleared
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.current).toBeNull();
  });
});
