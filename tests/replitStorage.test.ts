
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReplitStorage } from '../server/replitStorage';
import { DatabaseService } from '../server/databaseService';

// Mock Replit Database with realistic error responses
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

describe('ReplitStorage', () => {
  let storage: ReplitStorage;
  let databaseService: DatabaseService;
  
  beforeEach(() => {
    databaseService = new DatabaseService();
    storage = new ReplitStorage(databaseService);
    // Clear the mock database
    (databaseService as any).db.clear();
  });

  describe('User Operations', () => {
    it('should return undefined for non-existent user', async () => {
      const user = await storage.getUser('non-existent-id');
      expect(user).toBeUndefined();
    });

    it('should return undefined for non-existent GitHub user', async () => {
      const user = await storage.getUserByGitHubId('12345');
      expect(user).toBeUndefined();
    });

    it('should create and retrieve user', async () => {
      const newUser = await storage.createUser({
        githubId: '123456',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'github-token',
      });

      expect(newUser.id).toBeDefined();
      expect(newUser.githubId).toBe('123456');
      expect(newUser.username).toBe('testuser');

      // Retrieve by ID - dates are serialized as ISO strings
      const userById = await storage.getUser(newUser.id);
      expect(userById?.id).toBe(newUser.id);
      expect(userById?.githubId).toBe(newUser.githubId);
      expect(userById?.username).toBe(newUser.username);

      // Retrieve by GitHub ID
      const userByGithubId = await storage.getUserByGitHubId('123456');
      expect(userByGithubId?.id).toBe(newUser.id);
      expect(userByGithubId?.username).toBe(newUser.username);
    });

    it('should update user', async () => {
      const user = await storage.createUser({
        githubId: '789',
        username: 'oldname',
        avatarUrl: 'https://github.com/old.jpg',
        accessToken: 'old-token',
      });

      const updated = await storage.updateUser(user.id, {
        accessToken: 'new-token',
      });

      expect(updated?.accessToken).toBe('new-token');
      expect(updated?.username).toBe('oldname'); // Unchanged
    });
  });

  describe('User Settings', () => {
    it('should return undefined for non-existent settings', async () => {
      const settings = await storage.getUserSettings('non-existent-user');
      expect(settings).toBeUndefined();
    });

    it('should create and retrieve user settings', async () => {
      const user = await storage.createUser({
        githubId: '111',
        username: 'settingsuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      });

      const settings = await storage.createUserSettings({
        userId: user.id,
        mistralApiKey: 'test-api-key',
        githubRepoOwner: 'owner',
        githubRepoName: 'repo',
      });

      expect(settings.id).toBeDefined();
      expect(settings.userId).toBe(user.id);
      expect(settings.mistralApiKey).toBe('test-api-key');

      const retrieved = await storage.getUserSettings(user.id);
      expect(retrieved?.id).toBe(settings.id);
      expect(retrieved?.userId).toBe(settings.userId);
      expect(retrieved?.mistralApiKey).toBe(settings.mistralApiKey);
    });

    it('should update user settings', async () => {
      const user = await storage.createUser({
        githubId: '222',
        username: 'updateuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      });

      await storage.createUserSettings({
        userId: user.id,
        mistralApiKey: null,
        githubRepoOwner: null,
        githubRepoName: null,
      });

      const updated = await storage.updateUserSettings(user.id, {
        mistralApiKey: 'new-key',
      });

      expect(updated?.mistralApiKey).toBe('new-key');
    });
  });

  describe('Recordings', () => {
    it('should return undefined for non-existent recording', async () => {
      const recording = await storage.getRecording('non-existent-id');
      expect(recording).toBeUndefined();
    });

    it('should return empty array for user with no recordings', async () => {
      const recordings = await storage.getRecordingsByUserId('user-without-recordings');
      expect(recordings).toEqual([]);
    });

    it('should create and retrieve recording', async () => {
      const user = await storage.createUser({
        githubId: '333',
        username: 'recuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      });

      const recording = await storage.createRecording({
        userId: user.id,
        audioUrl: 'data:audio/webm;base64,ABC123',
        duration: 120,
        status: 'pending',
        transcript: null,
        summary: null,
        githubFileUrl: null,
      });

      expect(recording.id).toBeDefined();
      expect(recording.userId).toBe(user.id);
      expect(recording.status).toBe('pending');

      const retrieved = await storage.getRecording(recording.id);
      expect(retrieved?.id).toBe(recording.id);
      expect(retrieved?.userId).toBe(recording.userId);
      expect(retrieved?.status).toBe(recording.status);

      const userRecordings = await storage.getRecordingsByUserId(user.id);
      expect(userRecordings).toHaveLength(1);
      expect(userRecordings[0].id).toBe(recording.id);
      expect(userRecordings[0].status).toBe(recording.status);
    });

    it('should update recording', async () => {
      const user = await storage.createUser({
        githubId: '444',
        username: 'updaterecuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      });

      const recording = await storage.createRecording({
        userId: user.id,
        status: 'pending',
      });

      const updated = await storage.updateRecording(recording.id, {
        status: 'transcribed',
        transcript: 'Test transcript',
      });

      expect(updated?.status).toBe('transcribed');
      expect(updated?.transcript).toBe('Test transcript');
    });

    it('should delete recording', async () => {
      const user = await storage.createUser({
        githubId: '555',
        username: 'deleteuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      });

      const recording = await storage.createRecording({
        userId: user.id,
        status: 'pending',
      });

      const deleted = await storage.deleteRecording(recording.id);
      expect(deleted).toBe(true);

      const retrieved = await storage.getRecording(recording.id);
      expect(retrieved).toBeUndefined();

      const userRecordings = await storage.getRecordingsByUserId(user.id);
      expect(userRecordings).toHaveLength(0);
    });
  });
});
