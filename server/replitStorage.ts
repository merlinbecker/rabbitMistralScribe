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
import type { DatabaseService } from "./databaseService";

export class ReplitStorage implements IStorage {
  private db: DatabaseService;
  // Audio storage methods (in-memory)
  private audioData = new Map<string, string>();

  constructor(databaseService: DatabaseService) {
    this.db = databaseService;
  }

  // Helper methods for key prefixes
  private userKey(id: string) { return `user:${id}`; }
  private userGithubKey(githubId: string) { return `user:github:${githubId}`; }
  private settingsKey(userId: string) { return `settings:${userId}`; }
  private recordingKey(id: string) { return `recording:${id}`; }
  private userRecordingsKey(userId: string) { return `recordings:user:${userId}`; }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.db.get<User>(this.userKey(id));
  }

  async getUserByGitHubId(githubId: string): Promise<User | undefined> {
    const userId = await this.db.get<string>(this.userGithubKey(githubId));
    if (!userId) return undefined;
    return this.getUser(userId);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      githubId: insertUser.githubId,
      username: insertUser.username,
      avatarUrl: insertUser.avatarUrl ?? null,
      accessToken: insertUser.accessToken ?? null,
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
      id: user.id,
    };

    await this.db.set(this.userKey(id), updatedUser);

    console.log('[REPLIT_STORAGE] Updated user:', { id: updatedUser.id, githubId: updatedUser.githubId, username: updatedUser.username });
    return updatedUser;
  }

  // User settings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return this.db.get<UserSettings>(this.settingsKey(userId));
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
    return this.db.get<Recording>(this.recordingKey(id));
  }

  async getRecordingsByUserId(userId: string): Promise<Recording[]> {
    const recordingIds = await this.db.getArray<string>(this.userRecordingsKey(userId));
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
  }

  async createRecording(insertRecording: InsertRecording): Promise<Recording> {
    const id = randomUUID();
    const recording: Recording = {
      id,
      userId: insertRecording.userId,
      title: insertRecording.title ?? null,
      audioUrl: insertRecording.audioUrl ?? null,
      duration: insertRecording.duration ?? null,
      status: insertRecording.status || 'pending',
      transcript: insertRecording.transcript ?? null,
      summary: insertRecording.summary ?? null,
      githubFileUrl: insertRecording.githubFileUrl ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const recordingSize = JSON.stringify(recording).length;
    console.log(`[REPLIT_STORAGE] Saving recording ${id}, size: ${recordingSize} bytes`);

    try {
      await this.db.set(this.recordingKey(id), recording);
    } catch (error) {
      console.error(`[REPLIT_STORAGE] ❌ Failed to save recording ${id} (size: ${recordingSize} bytes):`, error);
      throw error;
    }

    // Add to user's recordings list
    const userRecordingsKey = this.userRecordingsKey(insertRecording.userId);
    const recordingIds = await this.db.getArray<string>(userRecordingsKey);
    recordingIds.push(id);
    await this.db.set(userRecordingsKey, recordingIds);

    console.log('[REPLIT_STORAGE] Created recording:', { id, userId: insertRecording.userId });
    return recording;
  }

  async updateRecording(id: string, updates: UpdateRecording): Promise<Recording | undefined> {
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
  }

  async deleteRecording(id: string): Promise<boolean> {
    const recording = await this.getRecording(id);
    if (!recording) return false;

    await this.db.delete(this.recordingKey(id));

    // Remove from user's recordings list
    const userRecordingsKey = this.userRecordingsKey(recording.userId);
    const recordingIds = await this.db.getArray<string>(userRecordingsKey);
    const updatedIds = recordingIds.filter((rid: string) => rid !== id);
    await this.db.set(userRecordingsKey, updatedIds);

    console.log('[REPLIT_STORAGE] Deleted recording:', { id });
    return true;
  }

  async saveAudio(id: string, base64Data: string): Promise<void> {
    console.log(`[REPLIT_STORAGE] Saving audio for ${id} in memory (size: ${base64Data.length})`);
    this.audioData.set(id, base64Data);
  }

  async getAudio(id: string): Promise<string | undefined> {
    return this.audioData.get(id);
  }

  async deleteAudio(id: string): Promise<void> {
    console.log(`[REPLIT_STORAGE] Deleting audio for ${id} from memory`);
    this.audioData.delete(id);
  }
}