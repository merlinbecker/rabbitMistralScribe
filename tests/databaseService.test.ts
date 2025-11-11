import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseService } from '../server/databaseService';

// Mock Replit Database with realistic behavior
vi.mock('@replit/database', () => {
  const mockDb = new Map<string, any>();

  return {
    default: class Database {
      async get(key: string) {
        const value = mockDb.get(key);
        // Simulate Replit DB behavior: return error object for missing keys
        if (value === undefined) {
          return { ok: false, error: { message: '', statusCode: 404 }, errorExtras: undefined };
        }
        return value;
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

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(() => {
    service = new DatabaseService();
    // Clear the mock database
    (service as any).db.clear();
  });

  describe('get() method', () => {
    it('should return undefined for non-existent key', async () => {
      const result = await service.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should store and retrieve string values', async () => {
      await service.set('test-key', 'test-value');
      const result = await service.get<string>('test-key');
      expect(result).toBe('test-value');
    });

    it('should store and retrieve object values with automatic serialization', async () => {
      const testObject = { name: 'John', age: 30, active: true };
      await service.set('user-key', testObject);
      const result = await service.get<typeof testObject>('user-key');
      expect(result).toEqual(testObject);
    });

    it('should handle nested objects correctly', async () => {
      const complexObject = {
        user: { id: '123', name: 'Test' },
        settings: { theme: 'dark', notifications: true },
        metadata: { created: '2024-01-01', tags: ['a', 'b', 'c'] }
      };
      await service.set('complex-key', complexObject);
      const result = await service.get<typeof complexObject>('complex-key');
      expect(result).toEqual(complexObject);
    });

    it('should handle null values', async () => {
      const objectWithNull = { value: null, other: 'test' };
      await service.set('null-key', objectWithNull);
      const result = await service.get<typeof objectWithNull>('null-key');
      expect(result).toEqual(objectWithNull);
    });
  });

  describe('getArray() method', () => {
    it('should return empty array for non-existent key', async () => {
      const result = await service.getArray('non-existent');
      expect(result).toEqual([]);
    });

    it('should store and retrieve array of strings', async () => {
      const testArray = ['id1', 'id2', 'id3'];
      await service.set('array-key', testArray);
      const result = await service.getArray<string>('array-key');
      expect(result).toEqual(testArray);
    });

    it('should store and retrieve array of objects', async () => {
      const testArray = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' }
      ];
      await service.set('object-array-key', testArray);
      const result = await service.getArray<{ id: string; name: string }>('object-array-key');
      expect(result).toEqual(testArray);
    });

    it('should handle empty arrays', async () => {
      await service.set('empty-array', []);
      const result = await service.getArray('empty-array');
      expect(result).toEqual([]);
    });
  });

  describe('set() method', () => {
    it('should store simple values', async () => {
      await service.set('simple-key', 'simple-value');
      const result = await service.get<string>('simple-key');
      expect(result).toBe('simple-value');
    });

    it('should overwrite existing values', async () => {
      await service.set('overwrite-key', 'first-value');
      await service.set('overwrite-key', 'second-value');
      const result = await service.get<string>('overwrite-key');
      expect(result).toBe('second-value');
    });

    it('should handle numeric values', async () => {
      await service.set('number-key', 42);
      const result = await service.get<number>('number-key');
      expect(result).toBe(42);
    });

    it('should handle boolean values', async () => {
      await service.set('bool-key', true);
      const result = await service.get<boolean>('bool-key');
      expect(result).toBe(true);
    });
  });

  describe('delete() method', () => {
    it('should delete existing key', async () => {
      await service.set('delete-key', 'value');
      const deleteResult = await service.delete('delete-key');
      expect(deleteResult).toBe(true);

      const getResult = await service.get('delete-key');
      expect(getResult).toBeUndefined();
    });

    it('should return true even for non-existent key', async () => {
      const result = await service.delete('non-existent-key');
      expect(result).toBe(true);
    });
  });

  describe('list() method', () => {
    it('should return empty array when no keys exist', async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('should list all keys', async () => {
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');
      await service.set('key3', 'value3');

      const result = await service.list();
      expect(result).toHaveLength(3);
      expect(result).toContain('key1');
      expect(result).toContain('key2');
      expect(result).toContain('key3');
    });

    it('should filter keys by prefix', async () => {
      await service.set('user:1', 'user1');
      await service.set('user:2', 'user2');
      await service.set('session:1', 'session1');

      const userKeys = await service.list('user:');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
      expect(userKeys).not.toContain('session:1');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type information with generics', async () => {
      interface User {
        id: string;
        name: string;
        email: string;
      }

      const user: User = { id: '123', name: 'Test User', email: 'test@example.com' };
      await service.set<User>('typed-user', user);
      const result = await service.get<User>('typed-user');

      // TypeScript should infer the correct type
      expect(result).toBeDefined();
      expect(result?.id).toBe('123');
      expect(result?.name).toBe('Test User');
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('Error Handling', () => {
    it('should return malformed JSON as string if it cannot be parsed', async () => {
      // Directly set invalid JSON to simulate corruption
      await (service as any).db.set('invalid-json', '{invalid json}');
      const result = await service.get('invalid-json');
      // Should return the string as-is since it cannot be parsed as JSON
      expect(result).toBe('{invalid json}');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle session data correctly', async () => {
      const sessionData = {
        userId: 'user-123',
        cookie: {
          expires: '2024-12-31T23:59:59.000Z',
          httpOnly: true,
          secure: true
        }
      };

      await service.set('session:abc123', sessionData);
      const retrieved = await service.get<typeof sessionData>('session:abc123');

      expect(retrieved).toEqual(sessionData);
    });

    it('should handle user data with optional fields', async () => {
      const userData = {
        id: 'user-456',
        githubId: '789',
        username: 'testuser',
        avatarUrl: 'https://example.com/avatar.jpg',
        accessToken: null
      };

      await service.set('user:456', userData);
      const retrieved = await service.get<typeof userData>('user:456');

      expect(retrieved).toEqual(userData);
    });

    it('should handle recording IDs list for a user', async () => {
      const recordingIds = ['rec-1', 'rec-2', 'rec-3'];
      await service.set('recordings:user:123', recordingIds);
      const retrieved = await service.getArray<string>('recordings:user:123');

      expect(retrieved).toEqual(recordingIds);
    });
  });
});
