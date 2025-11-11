
import session from "express-session";
import Database from "@replit/database";

export class ReplitSessionStore extends session.Store {
  private db: Database;
  
  constructor() {
    super();
    this.db = new Database();
  }
  
  private sessionKey(sid: string): string {
    return `session:${sid}`;
  }
  
  async get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Getting session:', sid);
      const sessionData = await this.db.get(this.sessionKey(sid));
      
      // Validate session data structure
      if (!sessionData || typeof sessionData !== 'object') {
        console.log('[SESSION_STORE] No valid session data found for:', sid);
        callback(null, null);
        return;
      }
      
      // Ensure cookie object exists with required properties
      if (!sessionData.cookie || typeof sessionData.cookie !== 'object') {
        console.log('[SESSION_STORE] Invalid session cookie structure for:', sid);
        callback(null, null);
        return;
      }
      
      console.log('[SESSION_STORE] Valid session found:', sid, 'userId:', sessionData.userId);
      callback(null, sessionData);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting session:', error);
      callback(error);
    }
  }
  
  async set(sid: string, session: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Setting session:', sid, 'userId:', session.userId);
      
      // Validate session structure before saving
      if (!session.cookie || typeof session.cookie !== 'object') {
        console.error('[SESSION_STORE] Invalid session cookie structure, cannot save');
        callback?.(new Error('Invalid session cookie structure'));
        return;
      }
      
      await this.db.set(this.sessionKey(sid), session);
      console.log('[SESSION_STORE] Session saved successfully:', sid);
      callback?.();
    } catch (error) {
      console.error('[SESSION_STORE] Error setting session:', error);
      callback?.(error);
    }
  }
  
  async destroy(sid: string, callback?: (err?: any) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Destroying session:', sid);
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
        const session = await this.db.get(key);
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
