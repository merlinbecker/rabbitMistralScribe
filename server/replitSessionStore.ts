
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
      const rawData = await this.db.get(this.sessionKey(sid));
      
      // Check if data exists and is not an error object from Replit DB
      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        callback(null, null);
        return;
      }
      
      // Unwrap Replit DB response if it's wrapped in {ok: true, value: "..."}
      let dataToProcess = rawData;
      if (typeof rawData === 'object' && 'ok' in rawData && 'value' in rawData && rawData.ok) {
        dataToProcess = rawData.value;
      }
      
      // Parse the session data if it's stored as JSON string
      let sessionData;
      if (typeof dataToProcess === 'string') {
        try {
          sessionData = JSON.parse(dataToProcess);
        } catch (e) {
          callback(null, null);
          return;
        }
      } else {
        sessionData = dataToProcess;
      }
      
      // Validate session data structure
      if (!sessionData || typeof sessionData !== 'object') {
        callback(null, null);
        return;
      }
      
      // Ensure cookie object exists with required properties
      if (!sessionData.cookie || typeof sessionData.cookie !== 'object') {
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
      
      const jsonString = JSON.stringify(sessionCopy);
      
      // Store as JSON string to ensure proper serialization
      await this.db.set(this.sessionKey(sid), jsonString);
      
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
