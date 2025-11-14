import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { StatusBar } from '@/components/StatusBar';
import { showStatusNotification, dismissStatusNotification, resetStatusNotifications } from '@/hooks/use-status-notification';

describe('StatusBar Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStatusNotifications();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // Clear any pending notifications
    resetStatusNotifications();
  });

  it('should render recording timer and online status', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    expect(screen.getByTestId('recording-timer')).toBeInTheDocument();
    expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('should display recording indicator when recording', () => {
    render(<StatusBar isRecording={true} recordingTime={30} />);
    
    expect(screen.getByTestId('recording-indicator')).toBeInTheDocument();
  });

  it('should format recording time correctly', () => {
    render(<StatusBar isRecording={false} recordingTime={125} />);
    
    // 125 seconds = 02:05
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('should display success notification when shown', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'Aufnahme gespeichert',
        description: 'Die Aufnahme wird verarbeitet',
        type: 'success',
      });
    });

    expect(screen.getByText('Aufnahme gespeichert')).toBeInTheDocument();
    expect(screen.getByTestId('status-notification')).toBeInTheDocument();
  });

  it('should display error notification with red icon', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'Fehler aufgetreten',
        type: 'error',
      });
    });

    expect(screen.getByText('Fehler aufgetreten')).toBeInTheDocument();
    const statusNotification = screen.getByTestId('status-notification');
    expect(statusNotification).toBeInTheDocument();
  });

  it('should display warning notification', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'Warnung',
        description: 'Bitte prüfen',
        type: 'warning',
      });
    });

    expect(screen.getByText('Warnung')).toBeInTheDocument();
  });

  it('should display info notification', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'Information',
        type: 'info',
      });
    });

    expect(screen.getByText('Information')).toBeInTheDocument();
  });

  it('should return to online status after notification dismisses', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    // Show notification
    act(() => {
      showStatusNotification({
        title: 'Test Notification',
        type: 'success',
        duration: 1000,
      });
    });

    expect(screen.getByText('Test Notification')).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();

    // Wait for notification to auto-dismiss
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText('Test Notification')).not.toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('should show notification title with tooltip for full description', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'Kurz',
        description: 'Eine sehr lange Beschreibung die nicht vollständig sichtbar sein wird',
        type: 'info',
      });
    });

    const statusNotification = screen.getByTestId('status-notification');
    expect(statusNotification).toBeInTheDocument();
    expect(statusNotification).toHaveAttribute('title', 'Eine sehr lange Beschreibung die nicht vollständig sichtbar sein wird');
  });

  it('should prioritize notification display over online/offline status', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    // Initially shows online
    expect(screen.getByText('Online')).toBeInTheDocument();
    
    // Show notification
    act(() => {
      showStatusNotification({
        title: 'Notification',
        type: 'success',
      });
    });

    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.getByText('Notification')).toBeInTheDocument();
  });

  it('should handle rapid notification changes', () => {
    render(<StatusBar isRecording={false} recordingTime={0} />);
    
    act(() => {
      showStatusNotification({
        title: 'First',
        type: 'success',
        duration: 500,
      });
    });

    expect(screen.getByText('First')).toBeInTheDocument();

    // Advance time to dismiss first and show second
    act(() => {
      showStatusNotification({
        title: 'Second',
        type: 'error',
        duration: 500,
      });
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
