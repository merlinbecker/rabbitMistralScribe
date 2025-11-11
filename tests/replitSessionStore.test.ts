
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReplitSessionStore } from '../server/replitSessionStore';
import type { SessionData } from 'express-session';

// Mock Replit Database
vi.mock('@replit/database', () => {
  const mockDb = new Map<string, any>();
  
  return {
    default: class Database {
      async get(key: string) {
        return mockDb.get(key);
      }
      
      async set(key: string, value: any) {
        mockDb.set(key, value);
      }
      
      async delete(key: string) {
        mockDb.delete(key);
      }
      
      async list(prefix?: string) {
        const keys = Array.from(mockDb.keys());
        return prefix ? keys.filter(k => k.startsWith(prefix)) : keys;
      }
      
      // For testing purposes
      clear() {
        mockDb.clear();
      }
    }
  };
});

describe('ReplitSessionStore', () => {
  let store: ReplitSessionStore;
  
  beforeEach(() => {
    store = new ReplitSessionStore();
    // Clear the mock database
    (store as any).db.clear();
  });

  describe('get', () => {
    it('should return null for non-existent session', async () => {
      const result = await new Promise<SessionData | null>((resolve) => {
        store.get('non-existent-sid', (err, session) => {
          expect(err).toBeNull();
          resolve(session || null);
        });
      });
      
      expect(result).toBeNull();
    });

    it('should retrieve existing session', async () => {
      const sessionData: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'test-user-123',
      };
      
      await new Promise<void>((resolve) => {
        store.set('test-sid', sessionData, () => resolve());
      });
      
      const result = await new Promise<SessionData | null>((resolve) => {
        store.get('test-sid', (err, session) => {
          expect(err).toBeNull();
          resolve(session || null);
        });
      });
      
      expect(result).toEqual(sessionData);
    });
  });

  describe('set', () => {
    it('should store session data', async () => {
      const sessionData: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'test-user-456',
      };
      
      await new Promise<void>((resolve) => {
        store.set('new-sid', sessionData, () => resolve());
      });
      
      const result = await new Promise<SessionData | null>((resolve) => {
        store.get('new-sid', (err, session) => {
          resolve(session || null);
        });
      });
      
      expect(result).toEqual(sessionData);
    });
  });

  describe('destroy', () => {
    it('should remove session', async () => {
      const sessionData: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'test-user-789',
      };
      
      await new Promise<void>((resolve) => {
        store.set('delete-sid', sessionData, () => resolve());
      });
      
      await new Promise<void>((resolve) => {
        store.destroy('delete-sid', () => resolve());
      });
      
      const result = await new Promise<SessionData | null>((resolve) => {
        store.get('delete-sid', (err, session) => {
          resolve(session || null);
        });
      });
      
      expect(result).toBeNull();
    });
  });
});
