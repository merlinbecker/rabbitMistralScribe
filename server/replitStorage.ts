
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
      return user || undefined;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting user:', error);
      return undefined;
    }
  }

  async getUserByGitHubId(githubId: string): Promise<User | undefined> {
    try {
      const userId = await this.db.get(this.userGithubKey(githubId));
      if (!userId) return undefined;
      return await this.getUser(userId);
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting user by GitHub ID:', error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      avatarUrl: insertUser.avatarUrl ?? null,
      accessToken: insertUser.accessToken ?? null,
    };
    
    try {
      await this.db.set(this.userKey(id), user);
      await this.db.set(this.userGithubKey(insertUser.githubId), id);
      console.log('[REPLIT_STORAGE] Created user:', { id, githubId: insertUser.githubId });
      return user;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error creating user:', error);
      throw error;
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    try {
      const user = await this.getUser(id);
      if (!user) return undefined;
      
      const updatedUser = { ...user, ...updates };
      await this.db.set(this.userKey(id), updatedUser);
      console.log('[REPLIT_STORAGE] Updated user:', { id: updatedUser.id, githubId: updatedUser.githubId });
      return updatedUser;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error updating user:', error);
      return undefined;
    }
  }

  // User settings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    try {
      const settings = await this.db.get(this.settingsKey(userId));
      
      console.log('[REPLIT_STORAGE] getUserSettings called for userId:', userId);
      console.log('[REPLIT_STORAGE] Found settings:', settings ? {
        id: settings.id,
        userId: settings.userId,
        hasMistralKey: !!settings.mistralApiKey,
        mistralKeyLength: settings.mistralApiKey?.length || 0
      } : 'NOT FOUND');
      
      return settings || undefined;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting user settings:', error);
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
    try {
      const recording = await this.db.get(this.recordingKey(id));
      return recording || undefined;
    } catch (error) {
      console.error('[REPLIT_STORAGE] Error getting recording:', error);
      return undefined;
    }
  }

  async getRecordingsByUserId(userId: string): Promise<Recording[]> {
    try {
      const recordingIds = await this.db.get(this.userRecordingsKey(userId)) || [];
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
      const recordingIds = await this.db.get(userRecordingsKey) || [];
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
      const recordingIds = await this.db.get(userRecordingsKey) || [];
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
