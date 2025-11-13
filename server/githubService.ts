import type { IStorage } from './storage';
import type { Recording } from '@shared/schema';

/**
 * Interface defining the structure for GitHub repository data
 */
export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  updated_at: string;
}

/**
 * Interface defining the structure for saving a recording to GitHub
 */
export interface SaveToGitHubParams {
  recordingId: string;
  userId: string;
}

/**
 * Interface defining the result of a GitHub save operation
 */
export interface SaveToGitHubResult {
  githubFileUrl: string;
  filename: string;
}

/**
 * Interface for GitHub Service operations
 */
export interface IGitHubService {
  /**
   * Fetch repositories for a user from GitHub
   * @param userId - The user ID to fetch repositories for
   * @returns Array of GitHub repositories
   * @throws Error if user or access token not found
   */
  fetchRepositories(userId: string): Promise<GitHubRepository[]>;

  /**
   * Save a recording as a markdown file to a GitHub repository
   * @param params - Parameters including recordingId and userId
   * @returns Result containing the GitHub file URL and filename
   * @throws Error if required data is missing or GitHub API call fails
   */
  saveRecordingToGitHub(params: SaveToGitHubParams): Promise<SaveToGitHubResult>;
}

/**
 * Service for managing GitHub repository operations
 * Implements dependency injection pattern and encapsulates all GitHub API interactions
 */
export class GitHubService implements IGitHubService {
  private storage: IStorage;
  private githubApiBaseUrl: string;

  constructor(storage: IStorage, githubApiBaseUrl: string = 'https://api.github.com') {
    this.storage = storage;
    this.githubApiBaseUrl = githubApiBaseUrl;
  }

  /**
   * Fetch repositories for a user from GitHub
   */
  async fetchRepositories(userId: string): Promise<GitHubRepository[]> {
    const user = await this.storage.getUser(userId);
    
    if (!user || !user.accessToken) {
      throw new Error('GitHub access token not found');
    }

    const response = await fetch(`${this.githubApiBaseUrl}/user/repos?per_page=100&sort=updated`, {
      headers: {
        'Authorization': `Bearer ${user.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Save a recording as a markdown file to a GitHub repository
   */
  async saveRecordingToGitHub(params: SaveToGitHubParams): Promise<SaveToGitHubResult> {
    const { recordingId, userId } = params;

    // Fetch required data
    const recording = await this.storage.getRecording(recordingId);
    const user = await this.storage.getUser(userId);
    const settings = await this.storage.getUserSettings(userId);

    // Validate required data
    if (!recording || !user || !settings || !user.accessToken) {
      throw new Error('Missing required data for GitHub save');
    }

    if (!settings.githubRepoOwner || !settings.githubRepoName) {
      throw new Error('GitHub repository not configured');
    }

    // Generate filename and markdown content
    const timestamp = recording.createdAt ? new Date(recording.createdAt).toISOString() : new Date().toISOString();
    const filename = `audio-note-${timestamp.replace(/[:.]/g, '-')}.md`;
    const markdownContent = this.generateMarkdownContent(recording, timestamp);
    const encodedContent = Buffer.from(markdownContent).toString('base64');

    // Create file in GitHub repository
    const createFileResponse = await fetch(
      `${this.githubApiBaseUrl}/repos/${settings.githubRepoOwner}/${settings.githubRepoName}/contents/audio-notes/${filename}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Audio-Notiz vom ${new Date(timestamp).toLocaleString('de-DE')}`,
          content: encodedContent,
        }),
      }
    );

    if (!createFileResponse.ok) {
      throw new Error(`GitHub file creation failed: ${createFileResponse.statusText}`);
    }

    const fileData = await createFileResponse.json();
    const githubFileUrl = fileData.content.html_url;

    // Update recording with GitHub URL
    await this.storage.updateRecording(recordingId, {
      githubFileUrl,
    });

    return {
      githubFileUrl,
      filename,
    };
  }

  /**
   * Generate markdown content for a recording
   * @private
   */
  private generateMarkdownContent(recording: Recording, timestamp: string): string {
    const duration = recording.duration || 0;
    const minutes = Math.floor(duration / 60);
    const seconds = (duration % 60).toString().padStart(2, '0');

    return `---
title: "${recording.title || 'Audio-Notiz'}"
date: ${timestamp}
duration: ${duration}
summary: |
  ${(recording.summary || 'Keine Zusammenfassung verfügbar').split('\n').join('\n  ')}
---

# ${recording.title || 'Audio-Notiz'}

## Transkript

${recording.transcript || 'Kein Transkript verfügbar'}

---

*Aufnahmedauer: ${minutes}:${seconds}*
*Erstellt: ${new Date(timestamp).toLocaleString('de-DE')}*
`;
  }
}
