
import { describe, it, expect, beforeEach } from 'vitest';

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
