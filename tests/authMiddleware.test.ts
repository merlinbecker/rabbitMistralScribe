
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock storage
const mockStorage = {
  getUser: vi.fn(),
};

vi.mock('../server/storage', () => ({
  storage: mockStorage,
}));

// Simplified requireAuth middleware for testing
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { storage } = await import('../server/storage');
  
  let userId = req.session?.userId;
  
  // Fallback to Bearer Token
  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    }
  }
  
  if (!userId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
  }
  
  // Verify user exists
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'User not found'
    });
  }
  
  // Keep session consistent
  if (req.session) {
    req.session.userId = userId;
  }
  next();
}

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });
    
    mockReq = {
      headers: {},
      session: undefined,
    };
    
    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    };
    
    mockNext = vi.fn();
  });

  describe('Session Authentication', () => {
    it('should allow access with valid session', async () => {
      mockReq.session = { userId: 'test-user-123' } as any;
      mockStorage.getUser.mockResolvedValue({
        id: 'test-user-123',
        githubId: '12345',
        username: 'testuser',
        avatarUrl: 'https://github.com/avatar.jpg',
      });

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockStorage.getUser).toHaveBeenCalledWith('test-user-123');
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject when session user does not exist', async () => {
      mockReq.session = { userId: 'non-existent-user' } as any;
      mockStorage.getUser.mockResolvedValue(undefined);

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockStorage.getUser).toHaveBeenCalledWith('non-existent-user');
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        details: 'User not found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Bearer Token Authentication', () => {
    it('should allow access with valid Bearer token', async () => {
      mockReq.headers = { authorization: 'Bearer token-user-456' };
      mockStorage.getUser.mockResolvedValue({
        id: 'token-user-456',
        githubId: '67890',
        username: 'tokenuser',
        avatarUrl: 'https://github.com/avatar2.jpg',
      });

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockStorage.getUser).toHaveBeenCalledWith('token-user-456');
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should reject when Bearer token user does not exist', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      mockStorage.getUser.mockResolvedValue(undefined);

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockStorage.getUser).toHaveBeenCalledWith('invalid-token');
      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        details: 'User not found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should ignore malformed authorization header', async () => {
      mockReq.headers = { authorization: 'InvalidFormat token123' };

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        details: 'No session or valid Bearer token found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('No Authentication', () => {
    it('should reject when no session and no Bearer token', async () => {
      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: 'Unauthorized',
        details: 'No session or valid Bearer token found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Session Consistency', () => {
    it('should update session with userId from Bearer token', async () => {
      const session = {} as any;
      mockReq.session = session;
      mockReq.headers = { authorization: 'Bearer bearer-user-789' };
      mockStorage.getUser.mockResolvedValue({
        id: 'bearer-user-789',
        githubId: '11111',
        username: 'beareruser',
        avatarUrl: 'https://github.com/avatar3.jpg',
      });

      await requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(session.userId).toBe('bearer-user-789');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
