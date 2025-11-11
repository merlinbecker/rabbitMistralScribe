import {
  type User,
  type InsertUser,
  type UserSettings,
  type InsertUserSettings,
  type UpdateUserSettings,
  type Recording,
  type InsertRecording,
  type UpdateRecording
} from "@shared/schema";
import { randomUUID } from "crypto";
import type { IStorage } from "./storage";
import Database from "@replit/database";

export class ReplitStorage implements IStorage {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  // Helper methods for key prefixes
  private userKey(id: string) { return `user:${id}`; }
  private userGithubKey(githubId: string) { return `user:github:${githubId}`; }
  private settingsKey(userId: string) { return `settings:${userId}`; }
  private recordingKey(id: string) { return `recording:${id}`; }
  private userRecordingsKey(userId: string) { return `recordings:user:${userId}`; }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    try {
      const user = await this.db.get(this.userKey(id));
      // Replit DB returns {ok: false, error: ...} for missing keys
      if (!user || (typeof user === 'object' && 'ok' in user && !user.ok)) {
        return undefined;
      }
      return user;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting user:', error);
      return undefined;
    }
  }

  async getUserByGitHubId(githubId: string): Promise<User | undefined> {
    console.log('[REPLIT_STORAGE] Looking up user by GitHub ID:', githubId);
    const userId = await this.db.get(this.userGithubKey(githubId));
    console.log('[REPLIT_STORAGE] Found userId for GitHub ID:', { githubId, userId });

    // Check if userId is valid (not an error object)
    if (!userId || (typeof userId === 'object' && 'ok' in userId && !userId.ok)) {
      console.log('[REPLIT_STORAGE] No valid userId found for GitHub ID:', githubId);
      return undefined;
    }

    const user = await this.getUser(userId as string);
    console.log('[REPLIT_STORAGE] Retrieved user:', { id: user?.id, username: user?.username });
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    const user: User = {
      id,
      githubId: insertUser.githubId,
      username: insertUser.username,
      avatarUrl: insertUser.avatarUrl,
      accessToken: insertUser.accessToken,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.set(this.userKey(id), user);
    await this.db.set(this.userGithubKey(insertUser.githubId), id);

    console.log('[REPLIT_STORAGE] Created user:', { id, githubId: insertUser.githubId, username: user.username });
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = await this.getUser(id);
    if (!user) {
      console.log('[REPLIT_STORAGE] User not found for update:', id);
      return undefined;
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      id: user.id, // Ensure ID is preserved
      updatedAt: new Date(),
    };

    await this.db.set(this.userKey(id), updatedUser);

    console.log('[REPLIT_STORAGE] Updated user:', { id: updatedUser.id, githubId: updatedUser.githubId, username: updatedUser.username });
    return updatedUser;
  }

  // User settings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    console.log('[REPLIT_STORAGE] getUserSettings called for userId:', userId);
    const key = `user_settings:${userId}`;
    const data = await this.db.get(key);

    if (!data) {
      console.log('[REPLIT_STORAGE] Settings not found for userId:', userId);
      return undefined;
    }

    try {
      // Unwrap Replit DB response if needed - DOUBLE unwrap!
      let unwrappedData = data;

      // First unwrap
      if (typeof data === 'object' && 'ok' in data && 'value' in data) {
        console.log('[REPLIT_STORAGE] First unwrap - Replit DB response object');
        unwrappedData = data.value;
      }

      // Second unwrap: might still be wrapped
      if (typeof unwrappedData === 'object' && 'ok' in unwrappedData && 'value' in unwrappedData) {
        console.log('[REPLIT_STORAGE] Second unwrap - nested Replit DB response object');
        unwrappedData = unwrappedData.value;
      }

      // Parse if still string
      const settings = typeof unwrappedData === 'string'
        ? JSON.parse(unwrappedData)
        : unwrappedData;

      console.log('[REPLIT_STORAGE] Parsed settings object:', {
        id: settings.id,
        userId: settings.userId,
        hasMistralKey: !!settings.mistralApiKey,
        mistralKeyLength: settings.mistralApiKey?.length || 0,
        allKeys: Object.keys(settings)
      });

      return settings;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error parsing settings:', error);
      return undefined;
    }
  }

  async createUserSettings(insertSettings: InsertUserSettings): Promise<UserSettings> {
    const id = randomUUID();
    const settings: UserSettings = {
      ...insertSettings,
      id,
      mistralApiKey: insertSettings.mistralApiKey ?? null,
      githubRepoOwner: insertSettings.githubRepoOwner ?? null,
      githubRepoName: insertSettings.githubRepoName ?? null,
      summaryTemplate: insertSettings.summaryTemplate ?? null,
      updatedAt: new Date(),
    };

    try {
      await this.db.set(this.settingsKey(insertSettings.userId), settings);

      console.log('[REPLIT_STORAGE] Created settings:', {
        id: settings.id,
        userId: settings.userId,
        hasMistralKey: !!settings.mistralApiKey
      });

      return settings;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error creating user settings:', error);
      throw error;
    }
  }

  async updateUserSettings(userId: string, updates: UpdateUserSettings): Promise<UserSettings | undefined> {
    try {
      const settings = await this.getUserSettings(userId);
      if (!settings) {
        console.error('[REPLIT_STORAGE] No settings found for user:', userId);
        return undefined;
      }

      console.log('[REPLIT_STORAGE] Current settings before update:', {
        id: settings.id,
        userId: settings.userId,
        hasMistralKey: !!settings.mistralApiKey,
        mistralKeyLength: settings.mistralApiKey?.length || 0
      });

      const updatedSettings: UserSettings = {
        ...settings,
        ...updates,
        updatedAt: new Date(),
      };

      await this.db.set(this.settingsKey(userId), updatedSettings);

      console.log('[REPLIT_STORAGE] Updated settings:', {
        id: updatedSettings.id,
        userId: updatedSettings.userId,
        hasMistralKey: !!updatedSettings.mistralApiKey,
        mistralKeyLength: updatedSettings.mistralApiKey?.length || 0
      });

      return updatedSettings;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error updating user settings:', error);
      return undefined;
    }
  }

  // Recording methods
  async getRecording(id: string): Promise<Recording | undefined> {
    console.log('[REPLIT_STORAGE] getRecording called for id:', id);
    const key = `recording:${id}`;
    const data = await this.db.get(key);
    console.log('[REPLIT_STORAGE] Raw data from DB:', {
      exists: !!data,
      type: typeof data,
      isString: typeof data === 'string',
      isObject: typeof data === 'object',
      hasOkField: data && typeof data === 'object' && 'ok' in data,
      hasValueField: data && typeof data === 'object' && 'value' in data,
      rawDataPreview: typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100)
    });

    if (!data) {
      console.log('[REPLIT_STORAGE] Recording not found:', id);
      return undefined;
    }

    try {
      // Unwrap Replit DB response if needed - DOUBLE unwrap!
      let unwrappedData = data;

      // First unwrap: {ok: true, value: {ok: true, value: "..."}}
      if (typeof data === 'object' && 'ok' in data && 'value' in data) {
        console.log('[REPLIT_STORAGE] First unwrap - Replit DB response object');
        unwrappedData = data.value;
      }

      // Second unwrap: might still be wrapped
      if (typeof unwrappedData === 'object' && 'ok' in unwrappedData && 'value' in unwrappedData) {
        console.log('[REPLIT_STORAGE] Second unwrap - nested Replit DB response object');
        unwrappedData = unwrappedData.value;
      }

      // Parse if still string
      const recording = typeof unwrappedData === 'string'
        ? JSON.parse(unwrappedData)
        : unwrappedData;

      console.log('[REPLIT_STORAGE] Parsed recording object:', {
        id: recording.id,
        userId: recording.userId,
        status: recording.status,
        hasAudio: !!recording.audioUrl,
        audioLength: recording.audioUrl?.length || 0,
        allKeys: Object.keys(recording)
      });

      return recording;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error parsing recording:', error);
      return undefined;
    }
  }

  async getRecordingsByUserId(userId: string): Promise<Recording[]> {
    try {
      const recordingIdsData = await this.db.get(this.userRecordingsKey(userId));

      // Check if recordingIdsData is valid and unwrap if needed
      let recordingIds: string[] = [];
      if (recordingIdsData && typeof recordingIdsData === 'object' && 'ok' in recordingIdsData && recordingIdsData.ok) {
        // Replit DB wrapped response
        recordingIds = Array.isArray(recordingIdsData.value) ? recordingIdsData.value : [];
      } else if (Array.isArray(recordingIdsData)) {
        // Direct array response
        recordingIds = recordingIdsData;
      } else if (!recordingIdsData || (typeof recordingIdsData === 'object' && 'ok' in recordingIdsData && !recordingIdsData.ok)) {
        // No data or error
        return [];
      }

      const recordings: Recording[] = [];

      for (const id of recordingIds) {
        const recording = await this.getRecording(id);
        if (recording) {
          recordings.push(recording);
        }
      }

      return recordings.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA; // Most recent first
      });
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting recordings by user:', error);
      return [];
    }
  }

  async createRecording(insertRecording: InsertRecording): Promise<Recording> {
    const id = randomUUID();
    const recording: Recording = {
      ...insertRecording,
      id,
      audioUrl: insertRecording.audioUrl ?? null,
      duration: insertRecording.duration ?? null,
      status: insertRecording.status || 'pending',
      transcript: insertRecording.transcript ?? null,
      summary: insertRecording.summary ?? null,
      githubFileUrl: insertRecording.githubFileUrl ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await this.db.set(this.recordingKey(id), recording);

      // Add to user's recordings list
      const userRecordingsKey = this.userRecordingsKey(insertRecording.userId);
      const recordingIdsData = await this.db.get(userRecordingsKey);

      // Check if recordingIdsData is valid and unwrap if needed
      let recordingIds: string[] = [];
      if (recordingIdsData && typeof recordingIdsData === 'object' && 'ok' in recordingIdsData && recordingIdsData.ok) {
        // Replit DB wrapped response
        recordingIds = Array.isArray(recordingIdsData.value) ? recordingIdsData.value : [];
      } else if (Array.isArray(recordingIdsData)) {
        // Direct array response
        recordingIds = recordingIdsData;
      }

      recordingIds.push(id);
      await this.db.set(userRecordingsKey, recordingIds);

      console.log('[REPLIT_STORAGE] Created recording:', { id, userId: insertRecording.userId });
      return recording;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error creating recording:', error);
      throw error;
    }
  }

  async updateRecording(id: string, updates: UpdateRecording): Promise<Recording | undefined> {
    try {
      const recording = await this.getRecording(id);
      if (!recording) return undefined;

      const updatedRecording: Recording = {
        ...recording,
        ...updates,
        updatedAt: new Date(),
      };

      await this.db.set(this.recordingKey(id), updatedRecording);
      console.log('[REPLIT_STORAGE] Updated recording:', { id });
      return updatedRecording;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error updating recording:', error);
      return undefined;
    }
  }

  async deleteRecording(id: string): Promise<boolean> {
    try {
      const recording = await this.getRecording(id);
      if (!recording) return false;

      await this.db.delete(this.recordingKey(id));

      // Remove from user's recordings list
      const userRecordingsKey = this.userRecordingsKey(recording.userId);
      const recordingIdsData = await this.db.get(userRecordingsKey);

      // Check if recordingIdsData is valid and unwrap if needed
      let recordingIds: string[] = [];
      if (recordingIdsData && typeof recordingIdsData === 'object' && 'ok' in recordingIdsData && recordingIdsData.ok) {
        // Replit DB wrapped response
        recordingIds = Array.isArray(recordingIdsData.value) ? recordingIdsData.value : [];
      } else if (Array.isArray(recordingIdsData)) {
        // Direct array response
        recordingIds = recordingIdsData;
      }

      const updatedIds = recordingIds.filter((rid: string) => rid !== id);
      await this.db.set(userRecordingsKey, updatedIds);

      console.log('[REPLIT_STORAGE] Deleted recording:', { id });
      return true;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error deleting recording:', error);
      return false;
    }
  }
}