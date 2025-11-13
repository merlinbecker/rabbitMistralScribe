import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubService } from '../server/githubService';
import type { IStorage } from '../server/storage';
import type { User, UserSettings, Recording } from '@shared/schema';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockStorage: IStorage;

  const mockUser: User = {
    id: 'user-123',
    githubId: '12345',
    username: 'testuser',
    avatarUrl: 'https://avatar.url',
    accessToken: 'github-token-123',
  };

  const mockUserSettings: UserSettings = {
    id: 'settings-123',
    userId: 'user-123',
    mistralApiKey: 'mistral-key-123',
    githubRepoOwner: 'testowner',
    githubRepoName: 'testrepo',
    summaryTemplate: null,
  };

  const mockRecording: Recording = {
    id: 'recording-123',
    userId: 'user-123',
    title: 'Test Recording',
    audioUrl: null,
    duration: 125,
    status: 'transcribed',
    transcript: 'This is a test transcript.',
    summary: 'Test summary',
    githubFileUrl: null,
    createdAt: new Date('2024-01-15T10:30:00Z'),
  };

  beforeEach(() => {
    mockStorage = {
      getUser: vi.fn(),
      getUserByGitHubId: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      getUserSettings: vi.fn(),
      createUserSettings: vi.fn(),
      updateUserSettings: vi.fn(),
      getRecording: vi.fn(),
      getRecordingsByUserId: vi.fn(),
      createRecording: vi.fn(),
      updateRecording: vi.fn(),
      deleteRecording: vi.fn(),
    };

    githubService = new GitHubService(mockStorage);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchRepositories', () => {
    it('should successfully fetch repositories for a user', async () => {
      const mockRepos = [
        {
          id: 1,
          name: 'repo1',
          full_name: 'testuser/repo1',
          owner: { login: 'testuser' },
          private: false,
          html_url: 'https://github.com/testuser/repo1',
          description: 'Test repo 1',
          updated_at: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          name: 'repo2',
          full_name: 'testuser/repo2',
          owner: { login: 'testuser' },
          private: true,
          html_url: 'https://github.com/testuser/repo2',
          description: 'Test repo 2',
          updated_at: '2024-01-14T10:00:00Z',
        },
      ];

      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRepos),
      });

      const repos = await githubService.fetchRepositories('user-123');

      expect(repos).toEqual(mockRepos);
      expect(mockStorage.getUser).toHaveBeenCalledWith('user-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/user/repos?per_page=100&sort=updated',
        {
          headers: {
            'Authorization': 'Bearer github-token-123',
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
    });

    it('should throw error when user not found', async () => {
      (mockStorage.getUser as any).mockResolvedValue(undefined);

      await expect(githubService.fetchRepositories('user-123'))
        .rejects.toThrow('GitHub access token not found');
    });

    it('should throw error when access token not found', async () => {
      const userWithoutToken = { ...mockUser, accessToken: null };
      (mockStorage.getUser as any).mockResolvedValue(userWithoutToken);

      await expect(githubService.fetchRepositories('user-123'))
        .rejects.toThrow('GitHub access token not found');
    });

    it('should throw error when GitHub API call fails', async () => {
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(githubService.fetchRepositories('user-123'))
        .rejects.toThrow('Failed to fetch repositories: Unauthorized');
    });
  });

  describe('saveRecordingToGitHub', () => {
    it('should successfully save recording to GitHub', async () => {
      const mockFileData = {
        content: {
          html_url: 'https://github.com/testowner/testrepo/blob/main/audio-notes/audio-note-2024-01-15T10-30-00-000Z.md',
        },
      };

      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);
      (mockStorage.updateRecording as any).mockResolvedValue({ ...mockRecording, githubFileUrl: mockFileData.content.html_url });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockFileData),
      });

      const result = await githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      });

      expect(result.githubFileUrl).toBe(mockFileData.content.html_url);
      expect(result.filename).toBe('audio-note-2024-01-15T10-30-00-000Z.md');
      expect(mockStorage.getRecording).toHaveBeenCalledWith('recording-123');
      expect(mockStorage.getUser).toHaveBeenCalledWith('user-123');
      expect(mockStorage.getUserSettings).toHaveBeenCalledWith('user-123');
      expect(mockStorage.updateRecording).toHaveBeenCalledWith('recording-123', {
        githubFileUrl: mockFileData.content.html_url,
      });
    });

    it('should generate correct markdown content with duration formatting', async () => {
      const mockFileData = {
        content: {
          html_url: 'https://github.com/testowner/testrepo/blob/main/audio-notes/test.md',
        },
      };

      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);
      (mockStorage.updateRecording as any).mockResolvedValue(mockRecording);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockFileData),
      });

      await githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      });

      // Verify the markdown content was properly formatted
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const decodedContent = Buffer.from(requestBody.content, 'base64').toString('utf-8');

      expect(decodedContent).toContain('title: "Test Recording"');
      expect(decodedContent).toContain('duration: 125');
      expect(decodedContent).toContain('This is a test transcript.');
      expect(decodedContent).toContain('Test summary');
      expect(decodedContent).toContain('*Aufnahmedauer: 2:05*');
    });

    it('should throw error when recording not found', async () => {
      (mockStorage.getRecording as any).mockResolvedValue(undefined);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('Missing required data for GitHub save');
    });

    it('should throw error when user not found', async () => {
      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(undefined);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('Missing required data for GitHub save');
    });

    it('should throw error when settings not found', async () => {
      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(undefined);

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('Missing required data for GitHub save');
    });

    it('should throw error when access token not found', async () => {
      const userWithoutToken = { ...mockUser, accessToken: null };
      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(userWithoutToken);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('Missing required data for GitHub save');
    });

    it('should throw error when GitHub repository not configured', async () => {
      const settingsWithoutRepo = { ...mockUserSettings, githubRepoOwner: null, githubRepoName: null };
      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(settingsWithoutRepo);

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('GitHub repository not configured');
    });

    it('should throw error when GitHub API call fails', async () => {
      (mockStorage.getRecording as any).mockResolvedValue(mockRecording);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);

      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      })).rejects.toThrow('GitHub file creation failed: Not Found');
    });

    it('should handle recording without createdAt timestamp', async () => {
      const recordingWithoutTimestamp = { ...mockRecording, createdAt: null };
      const mockFileData = {
        content: {
          html_url: 'https://github.com/testowner/testrepo/blob/main/audio-notes/test.md',
        },
      };

      (mockStorage.getRecording as any).mockResolvedValue(recordingWithoutTimestamp);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);
      (mockStorage.updateRecording as any).mockResolvedValue(recordingWithoutTimestamp);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockFileData),
      });

      const result = await githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      });

      expect(result.githubFileUrl).toBe(mockFileData.content.html_url);
      // Should still generate a filename even without createdAt
      expect(result.filename).toMatch(/^audio-note-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md$/);
    });

    it('should handle multi-line summaries correctly', async () => {
      const recordingWithMultilineSummary = {
        ...mockRecording,
        summary: 'Line 1\nLine 2\nLine 3',
      };
      const mockFileData = {
        content: {
          html_url: 'https://github.com/testowner/testrepo/blob/main/audio-notes/test.md',
        },
      };

      (mockStorage.getRecording as any).mockResolvedValue(recordingWithMultilineSummary);
      (mockStorage.getUser as any).mockResolvedValue(mockUser);
      (mockStorage.getUserSettings as any).mockResolvedValue(mockUserSettings);
      (mockStorage.updateRecording as any).mockResolvedValue(recordingWithMultilineSummary);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockFileData),
      });

      await githubService.saveRecordingToGitHub({
        recordingId: 'recording-123',
        userId: 'user-123',
      });

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const decodedContent = Buffer.from(requestBody.content, 'base64').toString('utf-8');

      // Verify multi-line summary formatting with proper indentation
      expect(decodedContent).toContain('summary: |\n  Line 1\n  Line 2\n  Line 3');
    });
  });

  describe('constructor', () => {
    it('should allow custom GitHub API base URL', () => {
      const customGithubService = new GitHubService(mockStorage, 'https://custom.github.com');
      expect(customGithubService).toBeInstanceOf(GitHubService);
    });

    it('should use default GitHub API base URL when not provided', () => {
      const defaultGithubService = new GitHubService(mockStorage);
      expect(defaultGithubService).toBeInstanceOf(GitHubService);
    });
  });
});
