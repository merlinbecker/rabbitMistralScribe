/**
 * EventBus - Central event management for SyncMiddleware
 * Provides type-safe event emission and subscription
 */

import type { SyncEvents, IEventBus } from './types';

type EventHandler<T = any> = (data: T) => void;

/**
 * EventBus implementation for loose coupling between components
 * Uses a Map-based listener registry for efficient event handling
 */
export class EventBus implements IEventBus {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event
   * @param event - Event name
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof SyncEvents>(
    event: K,
    handler: (data: SyncEvents[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Emit an event to all subscribers
   * @param event - Event name
   * @param data - Event data
   */
  emit<K extends keyof SyncEvents>(
    event: K,
    data: SyncEvents[K]
  ): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[EventBus] Error in handler for event "${event}":`, error);
      }
    });
  }

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param handler - Handler function to remove
   */
  off<K extends keyof SyncEvents>(
    event: K,
    handler: (data: SyncEvents[K]) => void
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Subscribe to an event for one-time execution
   * @param event - Event name
   * @param handler - Handler function
   */
  once<K extends keyof SyncEvents>(
    event: K,
    handler: (data: SyncEvents[K]) => void
  ): void {
    const wrappedHandler = (data: SyncEvents[K]) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }

  /**
   * Clear all event listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get count of listeners for debugging
   * @param event - Optional event name
   * @returns Count of listeners
   */
  getListenerCount(event?: keyof SyncEvents): number {
    if (event) {
      return this.listeners.get(event)?.size || 0;
    }
    let total = 0;
    this.listeners.forEach(handlers => {
      total += handlers.size;
    });
    return total;
  }
}
