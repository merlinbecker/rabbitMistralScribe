
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

import { DatabaseService } from '../server/databaseService';

describe('ReplitSessionStore', () => {
  let store: ReplitSessionStore;
  let databaseService: DatabaseService;
  
  beforeEach(() => {
    databaseService = new DatabaseService();
    store = new ReplitSessionStore(databaseService);
    // Clear the mock database
    (databaseService as any).db.clear();
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

  describe('touch', () => {
    it('should update session to prevent expiration', async () => {
      const sessionData: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'test-user-touch',
      };
      
      await new Promise<void>((resolve) => {
        store.set('touch-sid', sessionData, () => resolve());
      });
      
      const updatedSessionData: SessionData = {
        ...sessionData,
        cookie: {
          ...sessionData.cookie,
          expires: new Date(Date.now() + 172800000), // 2 days
        },
      };
      
      await new Promise<void>((resolve) => {
        store.touch('touch-sid', updatedSessionData, () => resolve());
      });
      
      const result = await new Promise<SessionData | null>((resolve) => {
        store.get('touch-sid', (err, session) => {
          resolve(session || null);
        });
      });
      
      expect(result).toEqual(updatedSessionData);
    });
  });

  describe('all', () => {
    it('should retrieve all sessions', async () => {
      const session1: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-1',
      };
      
      const session2: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-2',
      };
      
      await new Promise<void>((resolve) => {
        store.set('sid-1', session1, () => resolve());
      });
      
      await new Promise<void>((resolve) => {
        store.set('sid-2', session2, () => resolve());
      });
      
      const result = await new Promise<{ [sid: string]: SessionData } | null>((resolve) => {
        store.all((err, sessions) => {
          expect(err).toBeNull();
          resolve(sessions as { [sid: string]: SessionData } || null);
        });
      });
      
      expect(result).toBeDefined();
      expect(result?.['sid-1']?.userId).toBe(session1.userId);
      expect(result?.['sid-2']?.userId).toBe(session2.userId);
    });
  });

  describe('length', () => {
    it('should return the count of sessions', async () => {
      const session1: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-count-1',
      };
      
      const session2: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-count-2',
      };
      
      await new Promise<void>((resolve) => {
        store.set('count-sid-1', session1, () => resolve());
      });
      
      await new Promise<void>((resolve) => {
        store.set('count-sid-2', session2, () => resolve());
      });
      
      const length = await new Promise<number>((resolve) => {
        store.length((err, count) => {
          expect(err).toBeNull();
          resolve(count || 0);
        });
      });
      
      expect(length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('clear', () => {
    it('should remove all sessions', async () => {
      const session1: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-clear-1',
      };
      
      const session2: SessionData = {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000),
          httpOnly: true,
          path: '/',
        },
        userId: 'user-clear-2',
      };
      
      await new Promise<void>((resolve) => {
        store.set('clear-sid-1', session1, () => resolve());
      });
      
      await new Promise<void>((resolve) => {
        store.set('clear-sid-2', session2, () => resolve());
      });
      
      await new Promise<void>((resolve) => {
        store.clear(() => resolve());
      });
      
      const length = await new Promise<number>((resolve) => {
        store.length((err, count) => {
          resolve(count || 0);
        });
      });
      
      expect(length).toBe(0);
    });
  });
});
