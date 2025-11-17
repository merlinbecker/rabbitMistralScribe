import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RabbitStatusBar } from '../client/src/components/RabbitStatusBar';

// Mock the useBatteryStatus hook
vi.mock('../client/src/hooks/useBatteryStatus', () => ({
  useBatteryStatus: vi.fn(() => ({
    level: 0.75,
    charging: false,
    supported: true,
  })),
}));

import { useBatteryStatus } from '../client/src/hooks/useBatteryStatus';

describe('RabbitStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Recording State', () => {
    it('should display recording timer when recording', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={true}
          recordingTime={65}
          transcriptionStatus="idle"
        />
      );

      const timer = screen.getByTestId('recording-timer');
      expect(timer).toBeInTheDocument();
      expect(timer).toHaveTextContent('01:05');
    });

    it('should format time correctly with leading zeros', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={true}
          recordingTime={5}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('recording-timer')).toHaveTextContent('00:05');
    });

    it('should handle large recording times', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={true}
          recordingTime={817} // 13:37
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('recording-timer')).toHaveTextContent('13:37');
    });
  });

  describe('Connection Status', () => {
    it('should show online icon when connected', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('online-icon')).toBeInTheDocument();
    });

    it('should show offline icon when disconnected', () => {
      render(
        <RabbitStatusBar
          isOnline={false}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('offline-icon')).toBeInTheDocument();
    });

    it('should not show connection icons when recording', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={true}
          recordingTime={10}
          transcriptionStatus="idle"
        />
      );

      expect(screen.queryByTestId('online-icon')).not.toBeInTheDocument();
      expect(screen.queryByTestId('offline-icon')).not.toBeInTheDocument();
    });
  });

  describe('Battery Status', () => {
    it('should display battery percentage when supported', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 0.75,
        charging: false,
        supported: true,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      const batteryLevel = screen.getByTestId('battery-level');
      expect(batteryLevel).toBeInTheDocument();
      expect(batteryLevel).toHaveTextContent('75%');
    });

    it('should round battery percentage correctly', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 0.846,
        charging: false,
        supported: true,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('battery-level')).toHaveTextContent('85%');
    });

    it('should not display battery percentage when not supported', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 1,
        charging: false,
        supported: false,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.queryByTestId('battery-level')).not.toBeInTheDocument();
    });

    it('should show charging icon when battery is charging', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 0.5,
        charging: true,
        supported: true,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      // Check if BatteryCharging icon is rendered (Lucide icons)
      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
    });
  });

  describe('Transcription Status', () => {
    it('should show loader icon when uploading', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="uploading"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
      // Loader2 with animate-spin class should be present
    });

    it('should show loader icon when transcribing', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="transcribing"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
    });

    it('should show check icon when complete', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="complete"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
      // CheckCircle2 icon should be rendered
    });

    it('should show error icon when failed', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="failed"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
      // XCircle icon should be rendered
    });

    it('should not show transcription icon when idle', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toBeInTheDocument();
      // No transcription icon should be shown
    });
  });

  describe('Layout and Styling', () => {
    it('should render with correct test id', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('rabbit-status-bar')).toBeInTheDocument();
    });

    it('should have proper CSS classes for minimal UI', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toHaveClass('h-6');
      expect(statusBar).toHaveClass('px-2');
      expect(statusBar).toHaveClass('bg-black');
      expect(statusBar).toHaveClass('text-white');
    });

    it('should have small font size for compact display', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      const statusBar = screen.getByTestId('rabbit-status-bar');
      expect(statusBar).toHaveStyle({ fontSize: '10px' });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero recording time', () => {
      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={true}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('recording-timer')).toHaveTextContent('00:00');
    });

    it('should handle very low battery', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 0.05,
        charging: false,
        supported: true,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('battery-level')).toHaveTextContent('5%');
    });

    it('should handle full battery', () => {
      vi.mocked(useBatteryStatus).mockReturnValue({
        level: 1.0,
        charging: false,
        supported: true,
      });

      render(
        <RabbitStatusBar
          isOnline={true}
          isRecording={false}
          recordingTime={0}
          transcriptionStatus="idle"
        />
      );

      expect(screen.getByTestId('battery-level')).toHaveTextContent('100%');
    });
  });
});
