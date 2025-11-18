/**
 * OnlineValidator - Checks if device is online
 */

import type { Validator, QueuedRequest, ValidationResult } from '../types';

/**
 * Validates that the device is online before processing requests
 * Defers requests when offline until connection is restored
 */
export class OnlineValidator implements Validator {
  name = 'OnlineValidator';

  async validate(request: QueuedRequest): Promise<ValidationResult> {
    const isOnline = navigator.onLine;
    
    if (!isOnline) {
      return {
        valid: false,
        action: 'defer', // Request stays in queue
        reason: 'Device is offline'
      };
    }

    return { valid: true };
  }
}
