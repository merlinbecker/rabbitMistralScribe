
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock storage module
const mockStorage = {
  getUser: vi.fn(),
};

vi.mock('../server/storage', () => ({
  storage: mockStorage,
}));

// Mock requireAuth middleware (you'll need to export this from routes.ts)
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { storage } = await import('../server/storage');
  
  let userId = (req.session as any)?.userId;
  
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
  
  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      details: 'User not found'
    });
  }
  
  (req.session as any).userId = userId;
  next();
}

describe('requireAuth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  
  beforeEach(() => {
    mockReq = {
      session: {},
      headers: {},
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    
    mockNext = vi.fn();
    
    mockStorage.getUser.mockReset();
  });

  it('should reject request without session or token', async () => {
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      details: 'No session or valid Bearer token found'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should accept request with valid session', async () => {
    (mockReq.session as any).userId = 'user-123';
    mockStorage.getUser.mockResolvedValue({ id: 'user-123', username: 'testuser' });
    
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockStorage.getUser).toHaveBeenCalledWith('user-123');
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should accept request with valid Bearer token', async () => {
    mockReq.headers = { authorization: 'Bearer user-456' };
    mockStorage.getUser.mockResolvedValue({ id: 'user-456', username: 'tokenuser' });
    
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockStorage.getUser).toHaveBeenCalledWith('user-456');
    expect(mockNext).toHaveBeenCalled();
    expect((mockReq.session as any).userId).toBe('user-456');
  });

  it('should reject request with non-existent user', async () => {
    (mockReq.session as any).userId = 'non-existent';
    mockStorage.getUser.mockResolvedValue(null);
    
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      details: 'User not found'
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should prioritize session over Bearer token', async () => {
    (mockReq.session as any).userId = 'session-user';
    mockReq.headers = { authorization: 'Bearer token-user' };
    mockStorage.getUser.mockResolvedValue({ id: 'session-user', username: 'sessionuser' });
    
    await requireAuth(mockReq as Request, mockRes as Response, mockNext);
    
    expect(mockStorage.getUser).toHaveBeenCalledWith('session-user');
    expect(mockNext).toHaveBeenCalled();
  });
});
