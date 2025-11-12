
import session from "express-session";
import type { DatabaseService } from "./databaseService";

export class ReplitSessionStore extends session.Store {
  private db: DatabaseService;
  
  constructor(databaseService: DatabaseService) {
    super();
    this.db = databaseService;
  }
  
  private sessionKey(sid: string): string {
    return `session:${sid}`;
  }
  
  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      const sessionData = await this.db.get<session.SessionData>(this.sessionKey(sid));
      
      if (!sessionData) {
        callback(null, null);
        return;
      }
      
      // Validate session data structure
      if (typeof sessionData !== 'object' || !sessionData.cookie || typeof sessionData.cookie !== 'object') {
        callback(null, null);
        return;
      }
      
      // Convert date strings back to Date objects if needed
      if (sessionData.cookie.expires && typeof sessionData.cookie.expires === 'string') {
        sessionData.cookie.expires = new Date(sessionData.cookie.expires);
      }
      
      callback(null, sessionData);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting session:', error);
      callback(error);
    }
  }
  
  async set(sid: string, session: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      // Validate session structure before saving
      if (!session.cookie || typeof session.cookie !== 'object') {
        console.error('[SESSION_STORE] Invalid session cookie structure, cannot save');
        callback?.(new Error('Invalid session cookie structure'));
        return;
      }
      
      // Create a serializable copy of the session
      const sessionCopy = {
        ...session,
        cookie: {
          ...session.cookie,
          expires: session.cookie.expires ? session.cookie.expires.toISOString() : undefined
        }
      };
      
      await this.db.set(this.sessionKey(sid), sessionCopy);
      callback?.();
    } catch (error) {
      console.error('[SESSION_STORE] Error setting session:', error);
      callback?.(error);
    }
  }
  
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      await this.db.delete(this.sessionKey(sid));
      callback?.();
    } catch (error) {
      console.error('[SESSION_STORE] Error destroying session:', error);
      callback?.(error);
    }
  }
  
  async touch(sid: string, session: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      // Update session to prevent expiration
      await this.set(sid, session, callback);
    } catch (error) {
      console.error('[SESSION_STORE] Error touching session:', error);
      callback?.(error);
    }
  }
  
  async all(callback: (err: any, obj?: session.SessionData[] | { [sid: string]: session.SessionData } | null) => void): Promise<void> {
    try {
      const keys = await this.db.list('session:');
      const sessions: { [sid: string]: session.SessionData } = {};
      
      for (const key of keys) {
        const sid = key.replace('session:', '');
        const session = await this.db.get<session.SessionData>(key);
        if (session) {
          sessions[sid] = session;
        }
      }
      
      callback(null, sessions);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting all sessions:', error);
      callback(error);
    }
  }
  
  async length(callback: (err: any, length?: number) => void): Promise<void> {
    try {
      const keys = await this.db.list('session:');
      callback(null, keys.length);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting session count:', error);
      callback(error);
    }
  }
  
  async clear(callback?: (err?: any) => void): Promise<void> {
    try {
      const keys = await this.db.list('session:');
      for (const key of keys) {
        await this.db.delete(key);
      }
      callback?.();
    } catch (error) {
      console.error('[SESSION_STORE] Error clearing sessions:', error);
      callback?.(error);
    }
  }
}
