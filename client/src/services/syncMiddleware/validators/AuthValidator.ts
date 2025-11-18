/**
 * AuthValidator - Validates user authentication token
 */

import type { Validator, QueuedRequest, ValidationResult } from '../types';
import type { IEventBus } from '../types';
import { getStoredToken } from '@/lib/queryClient';

/**
 * Validates that user has a valid authentication token
 * Emits auth:required event if token is missing or expired
 */
export class AuthValidator implements Validator {
  name = 'AuthValidator';

  constructor(private eventBus: IEventBus) {}

  async validate(request: QueuedRequest): Promise<ValidationResult> {
    // Skip auth check if not required
    if (request.requiresAuth === false) {
      return { valid: true };
    }

    const token = getStoredToken();

    if (!token) {
      this.eventBus.emit('auth:required', { requestId: request.id });
      return {
        valid: false,
        action: 'wait', // Pauses until token available
        reason: 'Authentication required'
      };
    }

    // Token exists and is not expired (getStoredToken checks expiry)
    return { valid: true };
  }
}
