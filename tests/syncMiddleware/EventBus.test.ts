/**
 * EventBus Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@/services/syncMiddleware/EventBus';
import type { SyncEvents } from '@/services/syncMiddleware/types';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('on() and emit()', () => {
    it('should register and emit events', () => {
      const handler = vi.fn();
      eventBus.on('request:start', handler);

      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler).toHaveBeenCalledWith({ id: 'test-123' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call multiple handlers for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:start', handler2);

      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler1).toHaveBeenCalledWith({ id: 'test-123' });
      expect(handler2).toHaveBeenCalledWith({ id: 'test-123' });
    });

    it('should not call handlers for different events', () => {
      const handler = vi.fn();
      eventBus.on('request:start', handler);

      eventBus.emit('request:success', { id: 'test-123', data: {} });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle errors in handlers gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler1 = vi.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:start', handler2);

      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('off()', () => {
    it('should unsubscribe a handler', () => {
      const handler = vi.fn();
      eventBus.on('request:start', handler);

      eventBus.off('request:start', handler);
      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only unsubscribe the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:start', handler2);

      eventBus.off('request:start', handler1);
      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('once()', () => {
    it('should call handler only once', () => {
      const handler = vi.fn();
      eventBus.once('request:start', handler);

      eventBus.emit('request:start', { id: 'test-1' });
      eventBus.emit('request:start', { id: 'test-2' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ id: 'test-1' });
    });
  });

  describe('clear()', () => {
    it('should remove all event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:success', handler2);

      eventBus.clear();

      eventBus.emit('request:start', { id: 'test-123' });
      eventBus.emit('request:success', { id: 'test-123', data: {} });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe function', () => {
    it('should unsubscribe when calling returned function', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('request:start', handler);

      unsubscribe();
      eventBus.emit('request:start', { id: 'test-123' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getListenerCount()', () => {
    it('should return count of listeners for specific event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:start', handler2);

      expect(eventBus.getListenerCount('request:start')).toBe(2);
    });

    it('should return total count when no event specified', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.on('request:start', handler1);
      eventBus.on('request:success', handler2);

      expect(eventBus.getListenerCount()).toBe(2);
    });

    it('should return 0 for events with no listeners', () => {
      expect(eventBus.getListenerCount('request:start')).toBe(0);
    });
  });
});
