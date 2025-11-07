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

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByGitHubId(githubId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // User settings methods
  getUserSettings(userId: string): Promise<UserSettings | undefined>;
  createUserSettings(settings: InsertUserSettings): Promise<UserSettings>;
  updateUserSettings(userId: string, updates: UpdateUserSettings): Promise<UserSettings | undefined>;

  // Recording methods
  getRecording(id: string): Promise<Recording | undefined>;
  getRecordingsByUserId(userId: string): Promise<Recording[]>;
  createRecording(recording: InsertRecording): Promise<Recording>;
  updateRecording(id: string, updates: UpdateRecording): Promise<Recording | undefined>;
  deleteRecording(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userSettings: Map<string, UserSettings>;
  private recordings: Map<string, Recording>;

  constructor() {
    this.users = new Map();
    this.userSettings = new Map();
    this.recordings = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByGitHubId(githubId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.githubId === githubId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      avatarUrl: insertUser.avatarUrl ?? null,
      accessToken: insertUser.accessToken ?? null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // User settings methods
  async getUserSettings(userId: string): Promise<UserSettings | undefined> {
    return Array.from(this.userSettings.values()).find(
      (settings) => settings.userId === userId,
    );
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
    this.userSettings.set(id, settings);
    return settings;
  }

  async updateUserSettings(userId: string, updates: UpdateUserSettings): Promise<UserSettings | undefined> {
    const settings = await this.getUserSettings(userId);
    if (!settings) return undefined;

    const updatedSettings: UserSettings = {
      ...settings,
      ...updates,
      updatedAt: new Date(),
    };
    this.userSettings.set(settings.id, updatedSettings);
    return updatedSettings;
  }

  // Recording methods
  async getRecording(id: string): Promise<Recording | undefined> {
    return this.recordings.get(id);
  }

  async getRecordingsByUserId(userId: string): Promise<Recording[]> {
    return Array.from(this.recordings.values())
      .filter((recording) => recording.userId === userId)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA; // Most recent first
      });
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
    this.recordings.set(id, recording);
    return recording;
  }

  async updateRecording(id: string, updates: UpdateRecording): Promise<Recording | undefined> {
    const recording = this.recordings.get(id);
    if (!recording) return undefined;

    const updatedRecording: Recording = {
      ...recording,
      ...updates,
      updatedAt: new Date(),
    };
    this.recordings.set(id, updatedRecording);
    return updatedRecording;
  }

  async deleteRecording(id: string): Promise<boolean> {
    return this.recordings.delete(id);
  }
}

export const storage = new MemStorage();
