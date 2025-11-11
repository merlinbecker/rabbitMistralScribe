
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
      const rawData = await this.db.get(this.sessionKey(sid));
      
      console.log('[SESSION_STORE] Raw data from DB:', {
        exists: !!rawData,
        type: typeof rawData,
        isString: typeof rawData === 'string',
        isObject: typeof rawData === 'object',
        hasOkField: typeof rawData === 'object' && rawData && 'ok' in rawData,
        hasValueField: typeof rawData === 'object' && rawData && 'value' in rawData,
        rawDataPreview: typeof rawData === 'string' ? rawData.substring(0, 100) : JSON.stringify(rawData).substring(0, 100)
      });
      
      // Check if data exists and is not an error object from Replit DB
      if (!rawData || (typeof rawData === 'object' && 'ok' in rawData && !rawData.ok)) {
        console.log('[SESSION_STORE] No session found in DB for:', sid);
        callback(null, null);
        return;
      }
      
      // Unwrap Replit DB response if it's wrapped in {ok: true, value: "..."}
      let dataToProcess = rawData;
      if (typeof rawData === 'object' && 'ok' in rawData && 'value' in rawData && rawData.ok) {
        console.log('[SESSION_STORE] Unwrapping Replit DB response object');
        dataToProcess = rawData.value;
      }
      
      // Parse the session data if it's stored as JSON string
      let sessionData;
      if (typeof dataToProcess === 'string') {
        try {
          sessionData = JSON.parse(dataToProcess);
          console.log('[SESSION_STORE] Parsed JSON session data:', {
            hasCookie: !!sessionData.cookie,
            cookieType: typeof sessionData.cookie,
            cookieKeys: sessionData.cookie ? Object.keys(sessionData.cookie) : [],
            userId: sessionData.userId,
            fullCookie: JSON.stringify(sessionData.cookie)
          });
        } catch (e) {
          console.log('[SESSION_STORE] Failed to parse session JSON for:', sid, 'Error:', e);
          callback(null, null);
          return;
        }
      } else {
        sessionData = dataToProcess;
        console.log('[SESSION_STORE] Using data as session data:', {
          hasCookie: !!sessionData.cookie,
          cookieType: typeof sessionData.cookie,
          userId: sessionData.userId
        });
      }
      
      // Validate session data structure
      if (!sessionData || typeof sessionData !== 'object') {
        console.log('[SESSION_STORE] Invalid session data type for:', sid, 'Type:', typeof sessionData);
        callback(null, null);
        return;
      }
      
      // Ensure cookie object exists with required properties
      if (!sessionData.cookie || typeof sessionData.cookie !== 'object') {
        console.log('[SESSION_STORE] Missing or invalid cookie for:', sid, {
          hasCookie: !!sessionData.cookie,
          cookieType: typeof sessionData.cookie,
          cookieValue: sessionData.cookie,
          sessionDataKeys: Object.keys(sessionData)
        });
        callback(null, null);
        return;
      }
      
      // Convert date strings back to Date objects if needed
      if (sessionData.cookie.expires && typeof sessionData.cookie.expires === 'string') {
        sessionData.cookie.expires = new Date(sessionData.cookie.expires);
        console.log('[SESSION_STORE] Converted expires string to Date:', sessionData.cookie.expires);
      }
      
      console.log('[SESSION_STORE] Valid session found:', sid, 'userId:', sessionData.userId, 'cookie:', sessionData.cookie);
      callback(null, sessionData);
    } catch (error) {
      console.error('[SESSION_STORE] Error getting session:', error);
      callback(error);
    }
  }
  
  async set(sid: string, session: session.SessionData, callback?: (err?: any) => void): Promise<void> {
    try {
      console.log('[SESSION_STORE] Setting session:', sid, 'userId:', session.userId);
      console.log('[SESSION_STORE] Input session structure:', {
        hasCookie: !!session.cookie,
        cookieType: typeof session.cookie,
        cookieKeys: session.cookie ? Object.keys(session.cookie) : [],
        cookieExpires: session.cookie?.expires,
        fullSession: JSON.stringify(session)
      });
      
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
      console.log('[SESSION_STORE] Serialized session to store:', {
        jsonLength: jsonString.length,
        jsonPreview: jsonString.substring(0, 200),
        sessionCopyKeys: Object.keys(sessionCopy),
        cookieKeys: Object.keys(sessionCopy.cookie)
      });
      
      // Store as JSON string to ensure proper serialization
      await this.db.set(this.sessionKey(sid), jsonString);
      console.log('[SESSION_STORE] Session saved successfully to DB:', sid);
      
      // Verify it was saved correctly
      const verifyData = await this.db.get(this.sessionKey(sid));
      console.log('[SESSION_STORE] Verification read:', {
        type: typeof verifyData,
        matches: verifyData === jsonString,
        preview: typeof verifyData === 'string' ? verifyData.substring(0, 200) : JSON.stringify(verifyData).substring(0, 200)
      });
      
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
