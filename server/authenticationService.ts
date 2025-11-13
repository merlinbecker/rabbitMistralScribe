import type { Request, Response } from "express";
import type { IStorage } from "./storage";
import type { User, InsertUser } from "@shared/schema";

/**
 * GitHub OAuth user response interface
 */
interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

/**
 * Authentication result for OAuth callback
 */
export interface AuthenticationResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Token exchange result from GitHub
 */
interface TokenExchangeResult {
  access_token?: string;
  error?: string;
}

/**
 * Authentication Service
 * 
 * Encapsulates all GitHub OAuth2 authentication operations including:
 * - OAuth authorization flow
 * - Token exchange and user information retrieval
 * - User creation and management
 * - Session and token-based authentication
 */
export class AuthenticationService {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.clientId = process.env.GITHUB_CLIENT_ID;
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET;
  }

  /**
   * Check if GitHub OAuth is properly configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate GitHub OAuth authorization URL
   * 
   * @param req Express request object to extract protocol and host
   * @returns OAuth authorization URL or null if not configured
   */
  getAuthorizationUrl(req: Request): string | null {
    if (!this.clientId) {
      return null;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/github/callback`;
    const scope = 'repo,user';

    return `https://github.com/login/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  }

  /**
   * Exchange authorization code for access token
   * 
   * @param code Authorization code from GitHub
   * @returns Access token or null if exchange fails
   */
  private async exchangeCodeForToken(code: string): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
        }),
      });

      const data: TokenExchangeResult = await response.json();
      return data.access_token || null;
    } catch (error) {
      console.error('[AUTH_SERVICE] Token exchange failed:', error);
      return null;
    }
  }

  /**
   * Fetch user information from GitHub using access token
   * 
   * @param accessToken GitHub access token
   * @returns GitHub user data or null if request fails
   */
  private async fetchGitHubUser(accessToken: string): Promise<GitHubUser | null> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('[AUTH_SERVICE] Failed to fetch GitHub user:', error);
      return null;
    }
  }

  /**
   * Create or update user with GitHub data
   * 
   * @param githubUser GitHub user data
   * @param accessToken GitHub access token
   * @returns User object
   */
  private async upsertUser(githubUser: GitHubUser, accessToken: string): Promise<User> {
    const githubId = githubUser.id.toString();
    let user = await this.storage.getUserByGitHubId(githubId);

    if (!user) {
      // Create new user
      const insertUser: InsertUser = {
        githubId,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        accessToken,
      };
      user = await this.storage.createUser(insertUser);

      // Create default settings for new user
      await this.storage.createUserSettings({
        userId: user.id,
        mistralApiKey: null,
        githubRepoOwner: null,
        githubRepoName: null,
      });
    } else {
      // Update existing user's access token if changed
      if (user.accessToken !== accessToken) {
        const updated = await this.storage.updateUser(user.id, {
          accessToken,
        });
        if (updated) {
          user = updated;
        }
      }
    }

    return user;
  }

  /**
   * Handle OAuth callback and authenticate user
   * 
   * @param code Authorization code from GitHub
   * @returns Authentication result with user or error
   */
  async authenticateWithCode(code: string): Promise<AuthenticationResult> {
    // Exchange code for access token
    const accessToken = await this.exchangeCodeForToken(code);
    if (!accessToken) {
      return { success: false, error: 'no_token' };
    }

    // Fetch user info from GitHub
    const githubUser = await this.fetchGitHubUser(accessToken);
    if (!githubUser) {
      return { success: false, error: 'oauth_failed' };
    }

    // Create or update user
    try {
      const user = await this.upsertUser(githubUser, accessToken);
      return { success: true, user };
    } catch (error) {
      console.error('[AUTH_SERVICE] User upsert failed:', error);
      return { success: false, error: 'user_creation_failed' };
    }
  }

  /**
   * Create session for authenticated user
   * Invalidates all existing sessions for this user to prevent session conflicts
   * 
   * @param req Express request object
   * @param userId User ID to store in session
   * @returns Promise that resolves when session is saved
   */
  async createSession(req: Request, userId: string): Promise<void> {
    // Invalidate all existing sessions for this user
    await this.invalidateUserSessions(userId);
    
    return new Promise<void>((resolve, reject) => {
      req.session.userId = userId;
      req.session.save((err) => {
        if (err) {
          console.error('[AUTH_SERVICE] Session save error:', err);
          reject(err);
        } else {
          console.log('[AUTH_SERVICE] Session saved successfully for user:', userId);
          resolve();
        }
      });
    });
  }

  /**
   * Invalidate all existing sessions for a user
   * This prevents session conflicts when a user logs in from multiple OAuth apps
   * 
   * @param userId User ID whose sessions should be invalidated
   */
  private async invalidateUserSessions(userId: string): Promise<void> {
    try {
      // Get SessionStore from the storage's database service
      const sessionStore = (this.storage as any).db;
      if (!sessionStore || typeof sessionStore.list !== 'function') {
        console.warn('[AUTH_SERVICE] Cannot access session store for invalidation');
        return;
      }

      // Get all session keys
      const sessionKeys = await sessionStore.list('session:');
      console.log(`[AUTH_SERVICE] Checking ${sessionKeys.length} sessions for user ${userId}`);

      let invalidatedCount = 0;
      for (const key of sessionKeys) {
        const sessionData = await sessionStore.get(key);
        if (sessionData && sessionData.userId === userId) {
          await sessionStore.delete(key);
          invalidatedCount++;
          console.log(`[AUTH_SERVICE] Invalidated session: ${key}`);
        }
      }

      if (invalidatedCount > 0) {
        console.log(`[AUTH_SERVICE] Invalidated ${invalidatedCount} existing session(s) for user ${userId}`);
      }
    } catch (error) {
      console.error('[AUTH_SERVICE] Error invalidating user sessions:', error);
      // Don't throw - continue with session creation even if invalidation fails
    }
  }

  /**
   * Destroy user session
   * 
   * @param req Express request object
   * @returns Promise that resolves when session is destroyed
   */
  async destroySession(req: Request): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Extract user ID from request (session or Bearer token)
   * 
   * @param req Express request object
   * @returns User ID or null if not authenticated
   */
  getUserIdFromRequest(req: Request): string | null {
    // Check session first
    if (req.session?.userId) {
      return req.session.userId;
    }

    // Fallback to Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Verify if user exists and is valid
   * 
   * @param userId User ID to verify
   * @returns User object or null if not found
   */
  async verifyUser(userId: string): Promise<User | null> {
    try {
      const user = await this.storage.getUser(userId);
      return user || null;
    } catch (error) {
      console.error('[AUTH_SERVICE] User verification failed:', error);
      return null;
    }
  }

  /**
   * Get user with safe data (without access token)
   * 
   * @param userId User ID
   * @returns User object without sensitive data or null
   */
  async getSafeUser(userId: string): Promise<Omit<User, 'accessToken'> | null> {
    const user = await this.storage.getUser(userId);
    if (!user) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accessToken, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Middleware helper to authenticate request
   * Returns user if authenticated, null otherwise
   * 
   * @param req Express request object
   * @returns User object or null
   */
  async authenticateRequest(req: Request): Promise<User | null> {
    const userId = this.getUserIdFromRequest(req);
    if (!userId) {
      return null;
    }

    const user = await this.verifyUser(userId);
    if (!user) {
      return null;
    }

    // Update session for consistency
    if (req.session) {
      req.session.userId = userId;
    }

    return user;
  }
}
