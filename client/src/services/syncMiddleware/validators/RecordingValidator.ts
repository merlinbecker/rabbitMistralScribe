/**
 * RecordingValidator - Prevents requests during active recording
 */

import type { Validator, QueuedRequest, ValidationResult } from '../types';

/**
 * Validates that no recording is in progress
 * Defers requests during recording to avoid interference
 */
export class RecordingValidator implements Validator {
  name = 'RecordingValidator';

  constructor(private recordingState: () => boolean) {}

  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const isRecording = this.recordingState();
    
    if (isRecording) {
      return {
        valid: false,
        action: 'defer',
        reason: 'Recording in progress'
      };
    }

    return { valid: true };
  }
}
