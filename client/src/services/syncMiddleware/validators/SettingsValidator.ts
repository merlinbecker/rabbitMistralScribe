/**
 * SettingsValidator - Validates required user settings
 */

import type { Validator, QueuedRequest, ValidationResult, IEventBus } from '../types';
import type { UserSettings } from '@shared/schema';

/**
 * Validates that required settings (e.g., Mistral API key) are configured
 * Only checks for requests that explicitly require settings
 */
export class SettingsValidator implements Validator {
  name = 'SettingsValidator';

  constructor(
    private getSettings: () => Promise<UserSettings | null>,
    private eventBus: IEventBus
  ) {}

  async validate(request: QueuedRequest): Promise<ValidationResult> {
    // Only check for critical request types
    if (!request.requiresSettings) {
      return { valid: true };
    }

    const settings = await this.getSettings();

    if (!settings?.mistralApiKey) {
      this.eventBus.emit('settings:required', {
        requestId: request.id,
        missing: ['mistralApiKey']
      });
      return {
        valid: false,
        action: 'wait',
        reason: 'Mistral API key required'
      };
    }

    return { valid: true };
  }
}
