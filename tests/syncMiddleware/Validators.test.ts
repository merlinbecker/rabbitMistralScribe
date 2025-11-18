/**
 * Validators Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  OnlineValidator, 
  RecordingValidator, 
  AuthValidator, 
  SettingsValidator 
} from '@/services/syncMiddleware/validators';
import { EventBus } from '@/services/syncMiddleware/EventBus';
import { RequestPriority } from '@/services/syncMiddleware/types';
import type { QueuedRequest } from '@/services/syncMiddleware/types';
import type { UserSettings } from '@shared/schema';
import * as queryClientModule from '@/lib/queryClient';

describe('Validators', () => {
  const createMockRequest = (overrides?: Partial<QueuedRequest>): QueuedRequest => ({
    id: 'test-req-1',
    type: 'test',
    priority: RequestPriority.MEDIUM,
    payload: {},
    retries: 0,
    maxRetries: 3,
    timestamp: Date.now(),
    status: 'queued',
    requiresAuth: true,
    requiresSettings: false,
    executor: vi.fn(),
    ...overrides
  });

  describe('OnlineValidator', () => {
    let validator: OnlineValidator;
    let originalOnLine: boolean;

    beforeEach(() => {
      validator = new OnlineValidator();
      originalOnLine = navigator.onLine;
    });

    afterEach(() => {
      // Restore original value
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine
      });
    });

    it('should pass when device is online', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
    });

    it('should defer when device is offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(false);
      expect(result.action).toBe('defer');
      expect(result.reason).toBe('Device is offline');
    });
  });

  describe('RecordingValidator', () => {
    let validator: RecordingValidator;
    let isRecording: boolean;

    beforeEach(() => {
      isRecording = false;
      validator = new RecordingValidator(() => isRecording);
    });

    it('should pass when not recording', async () => {
      isRecording = false;
      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
    });

    it('should defer when recording is in progress', async () => {
      isRecording = true;
      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(false);
      expect(result.action).toBe('defer');
      expect(result.reason).toBe('Recording in progress');
    });
  });

  describe('AuthValidator', () => {
    let validator: AuthValidator;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
      validator = new AuthValidator(eventBus);
    });

    it('should pass when token exists', async () => {
      vi.spyOn(queryClientModule, 'getStoredToken').mockReturnValue('valid-token');

      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
    });

    it('should wait when token is missing', async () => {
      vi.spyOn(queryClientModule, 'getStoredToken').mockReturnValue(null);

      const authRequiredHandler = vi.fn();
      eventBus.on('auth:required', authRequiredHandler);

      const request = createMockRequest();
      const result = await validator.validate(request);

      expect(result.valid).toBe(false);
      expect(result.action).toBe('wait');
      expect(result.reason).toBe('Authentication required');
      expect(authRequiredHandler).toHaveBeenCalledWith({ requestId: 'test-req-1' });
    });

    it('should pass when auth is not required', async () => {
      vi.spyOn(queryClientModule, 'getStoredToken').mockReturnValue(null);

      const request = createMockRequest({ requiresAuth: false });
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
    });
  });

  describe('SettingsValidator', () => {
    let validator: SettingsValidator;
    let eventBus: EventBus;

    beforeEach(() => {
      eventBus = new EventBus();
    });

    it('should pass when settings are not required', async () => {
      const getSettings = vi.fn().mockResolvedValue(null);
      validator = new SettingsValidator(getSettings, eventBus);

      const request = createMockRequest({ requiresSettings: false });
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
      expect(getSettings).not.toHaveBeenCalled();
    });

    it('should pass when Mistral API key is configured', async () => {
      const mockSettings: UserSettings = {
        id: 'settings-1',
        userId: 'user-1',
        mistralApiKey: 'test-api-key',
        githubRepoId: null,
        summaryTemplate: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const getSettings = vi.fn().mockResolvedValue(mockSettings);
      validator = new SettingsValidator(getSettings, eventBus);

      const request = createMockRequest({ requiresSettings: true });
      const result = await validator.validate(request);

      expect(result.valid).toBe(true);
      expect(getSettings).toHaveBeenCalled();
    });

    it('should wait when Mistral API key is missing', async () => {
      const mockSettings: UserSettings = {
        id: 'settings-1',
        userId: 'user-1',
        mistralApiKey: null,
        githubRepoId: null,
        summaryTemplate: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const getSettings = vi.fn().mockResolvedValue(mockSettings);
      validator = new SettingsValidator(getSettings, eventBus);

      const settingsRequiredHandler = vi.fn();
      eventBus.on('settings:required', settingsRequiredHandler);

      const request = createMockRequest({ requiresSettings: true });
      const result = await validator.validate(request);

      expect(result.valid).toBe(false);
      expect(result.action).toBe('wait');
      expect(result.reason).toBe('Mistral API key required');
      expect(settingsRequiredHandler).toHaveBeenCalledWith({
        requestId: 'test-req-1',
        missing: ['mistralApiKey']
      });
    });

    it('should wait when settings are null', async () => {
      const getSettings = vi.fn().mockResolvedValue(null);
      validator = new SettingsValidator(getSettings, eventBus);

      const settingsRequiredHandler = vi.fn();
      eventBus.on('settings:required', settingsRequiredHandler);

      const request = createMockRequest({ requiresSettings: true });
      const result = await validator.validate(request);

      expect(result.valid).toBe(false);
      expect(result.action).toBe('wait');
      expect(settingsRequiredHandler).toHaveBeenCalled();
    });
  });
});
