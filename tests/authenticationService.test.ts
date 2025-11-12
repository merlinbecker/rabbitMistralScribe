import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthenticationService } from '../server/authenticationService';
import type { Request } from 'express';
import type { IStorage } from '../server/storage';
import type { User } from '@shared/schema';

// Mock storage implementation
const createMockStorage = (): IStorage => ({
  getUser: vi.fn(),
  getUserByGitHubId: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  getUserSettings: vi.fn(),
  createUserSettings: vi.fn(),
  updateUserSettings: vi.fn(),
  getRecording: vi.fn(),
  getRecordingsByUserId: vi.fn(),
  createRecording: vi.fn(),
  updateRecording: vi.fn(),
  deleteRecording: vi.fn(),
});

// Helper to create mock request
const createMockRequest = (options: {
  session?: { userId?: string };
  headers?: { authorization?: string; host?: string };
  protocol?: string;
  host?: string;
} = {}): Partial<Request> => {
  const headers = options.headers || {};
  if (!headers.host && options.host) {
    headers.host = options.host;
  }
  if (!headers.host) {
    headers.host = 'example.com';
  }
  
  return {
    session: options.session as any,
    headers: headers as any,
    protocol: options.protocol || 'https',
  };
};

describe('AuthenticationService', () => {
  let authService: AuthenticationService;
  let mockStorage: IStorage;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Set test environment variables
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';

    mockStorage = createMockStorage();
    authService = new AuthenticationService(mockStorage);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Configuration', () => {
    it('should detect when OAuth is properly configured', () => {
      expect(authService.isConfigured()).toBe(true);
    });

    it('should detect when OAuth is not configured', () => {
      delete process.env.GITHUB_CLIENT_ID;
      const unconfiguredService = new AuthenticationService(mockStorage);
      expect(unconfiguredService.isConfigured()).toBe(false);
    });

    it('should detect when client secret is missing', () => {
      delete process.env.GITHUB_CLIENT_SECRET;
      const unconfiguredService = new AuthenticationService(mockStorage);
      expect(unconfiguredService.isConfigured()).toBe(false);
    });
  });

  describe('Authorization URL Generation', () => {
    it('should generate correct authorization URL', () => {
      const mockReq = createMockRequest({
        protocol: 'https',
        host: 'example.com',
      });

      const url = authService.getAuthorizationUrl(mockReq as Request);

      expect(url).toBeTruthy();
      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test_client_id');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fapi%2Fauth%2Fgithub%2Fcallback');
      expect(url).toContain('scope=repo,user');
    });

    it('should use x-forwarded headers when available', () => {
      const mockReq = createMockRequest({
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'proxy.example.com',
        },
        protocol: 'http',
        host: 'internal.example.com',
      });

      const url = authService.getAuthorizationUrl(mockReq as Request);

      expect(url).toContain('redirect_uri=https%3A%2F%2Fproxy.example.com%2Fapi%2Fauth%2Fgithub%2Fcallback');
    });

    it('should return null when not configured', () => {
      delete process.env.GITHUB_CLIENT_ID;
      const unconfiguredService = new AuthenticationService(mockStorage);
      const mockReq = createMockRequest();

      const url = unconfiguredService.getAuthorizationUrl(mockReq as Request);

      expect(url).toBeNull();
    });
  });

  describe('OAuth Authentication Flow', () => {
    it('should successfully authenticate with valid code', async () => {
      // Mock fetch for token exchange
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'github_token_123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            avatar_url: 'https://github.com/avatar.jpg',
          }),
        }) as any;

      // Mock storage for new user
      vi.mocked(mockStorage.getUserByGitHubId).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createUser).mockResolvedValue({
        id: 'user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'github_token_123',
      } as User);
      vi.mocked(mockStorage.createUserSettings).mockResolvedValue({} as any);

      const result = await authService.authenticateWithCode('auth_code_123');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('testuser');
      expect(mockStorage.createUser).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'github_token_123',
      });
      expect(mockStorage.createUserSettings).toHaveBeenCalled();
    });

    it('should update existing user access token', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'new_github_token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            avatar_url: 'https://github.com/avatar.jpg',
          }),
        }) as any;

      const existingUser: User = {
        id: 'user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'old_github_token',
      };

      vi.mocked(mockStorage.getUserByGitHubId).mockResolvedValue(existingUser);
      vi.mocked(mockStorage.updateUser).mockResolvedValue({
        ...existingUser,
        accessToken: 'new_github_token',
      });

      const result = await authService.authenticateWithCode('auth_code_123');

      expect(result.success).toBe(true);
      expect(mockStorage.updateUser).toHaveBeenCalledWith('user-123', {
        accessToken: 'new_github_token',
      });
      expect(mockStorage.createUser).not.toHaveBeenCalled();
    });

    it('should handle token exchange failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ error: 'invalid_code' }),
      }) as any;

      const result = await authService.authenticateWithCode('invalid_code');

      expect(result.success).toBe(false);
      expect(result.error).toBe('no_token');
      expect(mockStorage.createUser).not.toHaveBeenCalled();
    });

    it('should handle GitHub API failure', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'valid_token' }),
        })
        .mockResolvedValueOnce({
          ok: false,
        }) as any;

      const result = await authService.authenticateWithCode('auth_code_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('oauth_failed');
    });

    it('should handle user creation failure', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          json: async () => ({ access_token: 'github_token_123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 12345,
            login: 'testuser',
            avatar_url: 'https://github.com/avatar.jpg',
          }),
        }) as any;

      vi.mocked(mockStorage.getUserByGitHubId).mockResolvedValue(undefined);
      vi.mocked(mockStorage.createUser).mockRejectedValue(new Error('Database error'));

      const result = await authService.authenticateWithCode('auth_code_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('user_creation_failed');
    });
  });

  describe('Session Management', () => {
    it('should create session successfully', async () => {
      const mockSession = {
        userId: undefined as string | undefined,
        save: vi.fn((callback) => callback(null)),
      };
      const mockReq = createMockRequest({ session: mockSession as any });

      await authService.createSession(mockReq as Request, 'user-123');

      expect(mockSession.userId).toBe('user-123');
      expect(mockSession.save).toHaveBeenCalled();
    });

    it('should handle session save error', async () => {
      const mockSession = {
        userId: undefined as string | undefined,
        save: vi.fn((callback) => callback(new Error('Session save failed'))),
      };
      const mockReq = createMockRequest({ session: mockSession as any });

      await expect(
        authService.createSession(mockReq as Request, 'user-123')
      ).rejects.toThrow('Session save failed');
    });

    it('should destroy session successfully', async () => {
      const mockSession = {
        destroy: vi.fn((callback) => callback(null)),
      };
      const mockReq = createMockRequest({ session: mockSession as any });

      await authService.destroySession(mockReq as Request);

      expect(mockSession.destroy).toHaveBeenCalled();
    });

    it('should handle session destroy error', async () => {
      const mockSession = {
        destroy: vi.fn((callback) => callback(new Error('Destroy failed'))),
      };
      const mockReq = createMockRequest({ session: mockSession as any });

      await expect(
        authService.destroySession(mockReq as Request)
      ).rejects.toThrow('Destroy failed');
    });
  });

  describe('User ID Extraction', () => {
    it('should extract user ID from session', () => {
      const mockReq = createMockRequest({
        session: { userId: 'session-user-123' },
      });

      const userId = authService.getUserIdFromRequest(mockReq as Request);

      expect(userId).toBe('session-user-123');
    });

    it('should extract user ID from Bearer token', () => {
      const mockReq = createMockRequest({
        headers: { authorization: 'Bearer token-user-456' },
      });

      const userId = authService.getUserIdFromRequest(mockReq as Request);

      expect(userId).toBe('token-user-456');
    });

    it('should prefer session over Bearer token', () => {
      const mockReq = createMockRequest({
        session: { userId: 'session-user-123' },
        headers: { authorization: 'Bearer token-user-456' },
      });

      const userId = authService.getUserIdFromRequest(mockReq as Request);

      expect(userId).toBe('session-user-123');
    });

    it('should return null when no authentication present', () => {
      const mockReq = createMockRequest();

      const userId = authService.getUserIdFromRequest(mockReq as Request);

      expect(userId).toBeNull();
    });

    it('should ignore malformed authorization header', () => {
      const mockReq = createMockRequest({
        headers: { authorization: 'InvalidFormat token123' },
      });

      const userId = authService.getUserIdFromRequest(mockReq as Request);

      expect(userId).toBeNull();
    });
  });

  describe('User Verification', () => {
    it('should verify existing user', async () => {
      const mockUser: User = {
        id: 'user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      };

      vi.mocked(mockStorage.getUser).mockResolvedValue(mockUser);

      const user = await authService.verifyUser('user-123');

      expect(user).toEqual(mockUser);
      expect(mockStorage.getUser).toHaveBeenCalledWith('user-123');
    });

    it('should return null for non-existent user', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(undefined);

      const user = await authService.verifyUser('non-existent-user');

      expect(user).toBeNull();
    });

    it('should handle verification error', async () => {
      vi.mocked(mockStorage.getUser).mockRejectedValue(new Error('Database error'));

      const user = await authService.verifyUser('user-123');

      expect(user).toBeNull();
    });
  });

  describe('Safe User Retrieval', () => {
    it('should return user without access token', async () => {
      const mockUser: User = {
        id: 'user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'secret_token',
      };

      vi.mocked(mockStorage.getUser).mockResolvedValue(mockUser);

      const safeUser = await authService.getSafeUser('user-123');

      expect(safeUser).toBeDefined();
      expect(safeUser?.id).toBe('user-123');
      expect(safeUser?.username).toBe('testuser');
      expect('accessToken' in safeUser!).toBe(false);
    });

    it('should return null for non-existent user', async () => {
      vi.mocked(mockStorage.getUser).mockResolvedValue(undefined);

      const safeUser = await authService.getSafeUser('non-existent');

      expect(safeUser).toBeNull();
    });
  });

  describe('Request Authentication', () => {
    it('should authenticate request with valid session', async () => {
      const mockUser: User = {
        id: 'user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
        accessToken: 'token',
      };

      const mockReq = createMockRequest({
        session: { userId: 'user-123' },
      });

      vi.mocked(mockStorage.getUser).mockResolvedValue(mockUser);

      const user = await authService.authenticateRequest(mockReq as Request);

      expect(user).toEqual(mockUser);
      expect(mockStorage.getUser).toHaveBeenCalledWith('user-123');
    });

    it('should authenticate request with Bearer token', async () => {
      const mockUser: User = {
        id: 'token-user-456',
        githubId: '67890',
        username: 'tokenuser',
        avatarUrl: 'https://github.com/avatar2.jpg',
        accessToken: 'token',
      };

      const mockReq = createMockRequest({
        headers: { authorization: 'Bearer token-user-456' },
        session: {},
      });

      vi.mocked(mockStorage.getUser).mockResolvedValue(mockUser);

      const user = await authService.authenticateRequest(mockReq as Request);

      expect(user).toEqual(mockUser);
      expect(mockStorage.getUser).toHaveBeenCalledWith('token-user-456');
    });

    it('should update session with userId from Bearer token', async () => {
      const mockUser: User = {
        id: 'token-user-456',
        githubId: '67890',
        username: 'tokenuser',
        avatarUrl: 'https://github.com/avatar2.jpg',
        accessToken: 'token',
      };

      const mockSession = { userId: undefined as string | undefined };
      const mockReq = createMockRequest({
        headers: { authorization: 'Bearer token-user-456' },
        session: mockSession as any,
      });

      vi.mocked(mockStorage.getUser).mockResolvedValue(mockUser);

      await authService.authenticateRequest(mockReq as Request);

      expect(mockSession.userId).toBe('token-user-456');
    });

    it('should return null when no authentication present', async () => {
      const mockReq = createMockRequest();

      const user = await authService.authenticateRequest(mockReq as Request);

      expect(user).toBeNull();
      expect(mockStorage.getUser).not.toHaveBeenCalled();
    });

    it('should return null when user does not exist', async () => {
      const mockReq = createMockRequest({
        session: { userId: 'non-existent-user' },
      });

      vi.mocked(mockStorage.getUser).mockResolvedValue(undefined);

      const user = await authService.authenticateRequest(mockReq as Request);

      expect(user).toBeNull();
    });
  });
});
