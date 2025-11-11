
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock user data structure
interface TokenData {
  userId: string;
  expiresAt: Date;
}

// Simple token storage simulation
class TokenStorage {
  private tokens = new Map<string, TokenData>();

  setToken(token: string, userId: string, expiresInDays: number = 30) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    this.tokens.set(token, {
      userId,
      expiresAt,
    });
  }

  getToken(token: string): TokenData | undefined {
    return this.tokens.get(token);
  }

  isTokenValid(token: string): boolean {
    const data = this.tokens.get(token);
    if (!data) return false;
    return new Date() < data.expiresAt;
  }

  removeToken(token: string): void {
    this.tokens.delete(token);
  }

  clearExpiredTokens(): number {
    const now = new Date();
    let count = 0;
    
    for (const [token, data] of this.tokens.entries()) {
      if (now >= data.expiresAt) {
        this.tokens.delete(token);
        count++;
      }
    }
    
    return count;
  }
}

describe('Token Storage', () => {
  let tokenStorage: TokenStorage;

  beforeEach(() => {
    tokenStorage = new TokenStorage();
  });

  describe('setToken', () => {
    it('should store token with expiration date', () => {
      const userId = 'user-123';
      const token = 'test-token-abc';
      
      tokenStorage.setToken(token, userId, 30);
      
      const data = tokenStorage.getToken(token);
      expect(data).toBeDefined();
      expect(data?.userId).toBe(userId);
      expect(data?.expiresAt).toBeInstanceOf(Date);
    });

    it('should calculate correct expiration date', () => {
      const userId = 'user-456';
      const token = 'test-token-def';
      const days = 7;
      
      const before = new Date();
      before.setDate(before.getDate() + days);
      
      tokenStorage.setToken(token, userId, days);
      
      const data = tokenStorage.getToken(token);
      const after = new Date();
      after.setDate(after.getDate() + days);
      
      expect(data?.expiresAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(data?.expiresAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', () => {
      const token = 'valid-token';
      tokenStorage.setToken(token, 'user-789', 30);
      
      expect(tokenStorage.isTokenValid(token)).toBe(true);
    });

    it('should return false for non-existent token', () => {
      expect(tokenStorage.isTokenValid('non-existent')).toBe(false);
    });

    it('should return false for expired token', () => {
      const token = 'expired-token';
      tokenStorage.setToken(token, 'user-999', -1); // Expired yesterday
      
      expect(tokenStorage.isTokenValid(token)).toBe(false);
    });
  });

  describe('removeToken', () => {
    it('should delete token on logout', () => {
      const token = 'logout-token';
      tokenStorage.setToken(token, 'user-111', 30);
      
      expect(tokenStorage.getToken(token)).toBeDefined();
      
      tokenStorage.removeToken(token);
      
      expect(tokenStorage.getToken(token)).toBeUndefined();
    });
  });

  describe('clearExpiredTokens', () => {
    it('should remove all expired tokens', () => {
      tokenStorage.setToken('valid-1', 'user-1', 30);
      tokenStorage.setToken('valid-2', 'user-2', 30);
      tokenStorage.setToken('expired-1', 'user-3', -1);
      tokenStorage.setToken('expired-2', 'user-4', -2);
      
      const removed = tokenStorage.clearExpiredTokens();
      
      expect(removed).toBe(2);
      expect(tokenStorage.isTokenValid('valid-1')).toBe(true);
      expect(tokenStorage.isTokenValid('valid-2')).toBe(true);
      expect(tokenStorage.isTokenValid('expired-1')).toBe(false);
      expect(tokenStorage.isTokenValid('expired-2')).toBe(false);
    });

    it('should return 0 when no expired tokens', () => {
      tokenStorage.setToken('valid-1', 'user-1', 30);
      tokenStorage.setToken('valid-2', 'user-2', 30);
      
      const removed = tokenStorage.clearExpiredTokens();
      
      expect(removed).toBe(0);
    });
  });
});
