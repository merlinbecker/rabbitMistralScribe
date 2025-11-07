import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  githubId: text("github_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token"),
});

// User settings for BYOK and repo selection
export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  mistralApiKey: text("mistral_api_key"),
  githubRepoOwner: text("github_repo_owner"),
  githubRepoName: text("github_repo_name"),
  summaryTemplate: text("summary_template"), // Custom template for AI summarization
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audio recordings
export const recordings = pgTable("recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  audioUrl: text("audio_url"), // URL to stored audio file
  duration: integer("duration"), // in seconds
  status: text("status").notNull().default("pending"), // pending, transcribing, transcribed, failed
  transcript: text("transcript"),
  summary: text("summary"),
  githubFileUrl: text("github_file_url"), // URL to the created markdown file
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  githubId: true,
  username: true,
  avatarUrl: true,
  accessToken: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertRecordingSchema = createInsertSchema(recordings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRecordingSchema = createInsertSchema(recordings).partial().omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const updateUserSettingsSchema = createInsertSchema(userSettings).partial().omit({
  id: true,
  userId: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>;

export type Recording = typeof recordings.$inferSelect;
export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type UpdateRecording = z.infer<typeof updateRecordingSchema>;

// Frontend-only types for IndexedDB offline storage
export interface PendingRecording {
  id: string;
  audioBlob: Blob;
  duration: number;
  timestamp: number;
  status: 'queued' | 'uploading' | 'failed';
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
}
