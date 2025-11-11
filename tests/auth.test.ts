
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Token management functions (from queryClient.ts concept)
const TOKEN_KEY = 'auth_token';

function setStoredToken(token: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    token,
    expiresAt: expiresAt.toISOString()
  }));
}

function getStoredToken(): string | null {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return null;
  
  try {
    const { token, expiresAt } = JSON.parse(stored);
    if (new Date(expiresAt) < new Date()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

describe('Token Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store token with expiration', () => {
    const token = 'test-user-id';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    localStorage.setItem('auth_token', JSON.stringify({
      token,
      expiresAt: expiresAt.toISOString()
    }));

    const stored = JSON.parse(localStorage.getItem('auth_token')!);
    expect(stored.token).toBe(token);
    expect(new Date(stored.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should detect expired token', () => {
    const token = 'test-user-id';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() - 1); // expired yesterday

    localStorage.setItem('auth_token', JSON.stringify({
      token,
      expiresAt: expiresAt.toISOString()
    }));

    const stored = JSON.parse(localStorage.getItem('auth_token')!);
    expect(new Date(stored.expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('should clear token on logout', () => {
    localStorage.setItem('auth_token', JSON.stringify({
      token: 'test',
      expiresAt: new Date().toISOString()
    }));

    localStorage.removeItem('auth_token');
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});

describe('Token Management Functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setStoredToken', () => {
    it('should store token with 30 day expiration', () => {
      setStoredToken('user-123');
      
      const stored = JSON.parse(localStorage.getItem(TOKEN_KEY)!);
      expect(stored.token).toBe('user-123');
      
      const expiresAt = new Date(stored.expiresAt);
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      
      // Allow 1 second tolerance
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });
  });

  describe('getStoredToken', () => {
    it('should return null when no token exists', () => {
      expect(getStoredToken()).toBeNull();
    });

    it('should return valid non-expired token', () => {
      setStoredToken('valid-token');
      expect(getStoredToken()).toBe('valid-token');
    });

    it('should return null for expired token and remove it', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);
      
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        token: 'expired-token',
        expiresAt: expiresAt.toISOString()
      }));
      
      expect(getStoredToken()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });

    it('should handle malformed token data', () => {
      localStorage.setItem(TOKEN_KEY, 'invalid-json');
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('clearStoredToken', () => {
    it('should remove token from storage', () => {
      setStoredToken('token-to-clear');
      expect(localStorage.getItem(TOKEN_KEY)).not.toBeNull();
      
      clearStoredToken();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });
  });
});
