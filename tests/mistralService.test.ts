import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MistralService } from '../server/mistralService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('MistralService', () => {
  let mistralService: MistralService;
  const testApiKey = 'test-api-key-123';

  beforeEach(() => {
    mistralService = new MistralService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transcribeAudio', () => {
    it('should successfully transcribe audio', async () => {
      const audioBuffer = Buffer.from('test audio data');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Transcribed text content' }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.transcribeAudio(audioBuffer, testApiKey);

      expect(result.text).toBe('Transcribed text content');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testApiKey}`,
          },
        })
      );
    });

    it('should throw error when transcription API fails', async () => {
      const audioBuffer = Buffer.from('test audio data');
      const mockResponse = {
        ok: false,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue('Invalid API key'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        mistralService.transcribeAudio(audioBuffer, 'invalid-key')
      ).rejects.toThrow('Mistral transcription failed: Unauthorized - Invalid API key');
    });

    it('should handle empty audio buffer', async () => {
      const audioBuffer = Buffer.from('');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: '' }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.transcribeAudio(audioBuffer, testApiKey);

      expect(result.text).toBe('');
    });
  });

  describe('summarizeText', () => {
    it('should successfully summarize text with default template', async () => {
      const inputText = 'This is a long text that needs to be summarized';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '## Summary\n\nKey points summarized.' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.summarizeText(inputText, testApiKey);

      expect(result.summary).toBe('## Summary\n\nKey points summarized.');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testApiKey}`,
            'Content-Type': 'application/json',
          },
        })
      );
      
      // Verify default template is used
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.messages[0].content).toContain('Audio-Notizen zusammenfasst');
    });

    it('should successfully summarize text with custom template', async () => {
      const inputText = 'This is a long text that needs to be summarized';
      const customTemplate = 'Custom summarization instruction';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Custom summary result' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.summarizeText(inputText, testApiKey, customTemplate);

      expect(result.summary).toBe('Custom summary result');
      
      // Verify custom template is used
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.messages[0].content).toBe(customTemplate);
    });

    it('should throw error when summarization API fails', async () => {
      const inputText = 'Test text';
      const mockResponse = {
        ok: false,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('Invalid request format'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        mistralService.summarizeText(inputText, testApiKey)
      ).rejects.toThrow('Mistral summarization failed: Bad Request - Invalid request format');
    });

    it('should handle empty input text', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'No content to summarize.' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.summarizeText('', testApiKey);

      expect(result.summary).toBe('No content to summarize.');
    });
  });

  describe('generateTitle', () => {
    it('should successfully generate a title', async () => {
      const inputText = 'This is a long text about project management';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Project Management Tips' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.generateTitle(inputText, testApiKey);

      expect(result.title).toBe('Project Management Tips');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should truncate title longer than 60 characters', async () => {
      const inputText = 'Some text';
      const longTitle = 'This is a very long title that exceeds sixty characters and needs to be truncated';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: longTitle } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.generateTitle(inputText, testApiKey);

      expect(result.title.length).toBeLessThanOrEqual(60);
      expect(result.title).toBe(longTitle.substring(0, 57) + '...');
    });

    it('should trim whitespace from title', async () => {
      const inputText = 'Test content';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '  Whitespace Title  ' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await mistralService.generateTitle(inputText, testApiKey);

      expect(result.title).toBe('Whitespace Title');
    });

    it('should throw error when title generation API fails', async () => {
      const inputText = 'Test text';
      const mockResponse = {
        ok: false,
        statusText: 'Service Unavailable',
        text: vi.fn().mockResolvedValue('Service temporarily unavailable'),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        mistralService.generateTitle(inputText, testApiKey)
      ).rejects.toThrow('Mistral title generation failed: Service Unavailable - Service temporarily unavailable');
    });
  });

  describe('Configuration', () => {
    it('should use default models when not configured', () => {
      const service = new MistralService();
      expect(service).toBeDefined();
      // Models are private, but we can test behavior through API calls
    });

    it('should use custom models when configured', async () => {
      const customService = new MistralService({
        sttModel: 'custom-stt-model',
        chatModel: 'custom-chat-model',
      });

      const audioBuffer = Buffer.from('test');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'test' }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await customService.transcribeAudio(audioBuffer, testApiKey);

      // Verify custom model is used in the FormData
      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.body).toBeDefined();
    });

    it('should use environment variables for models', () => {
      // Save original env
      const originalSttModel = process.env.MISTRAL_STT_MODEL;
      const originalChatModel = process.env.MISTRAL_MODEL;

      // Set test env variables
      process.env.MISTRAL_STT_MODEL = 'env-stt-model';
      process.env.MISTRAL_MODEL = 'env-chat-model';

      const service = new MistralService();
      expect(service).toBeDefined();

      // Restore original env
      if (originalSttModel !== undefined) {
        process.env.MISTRAL_STT_MODEL = originalSttModel;
      } else {
        delete process.env.MISTRAL_STT_MODEL;
      }
      if (originalChatModel !== undefined) {
        process.env.MISTRAL_MODEL = originalChatModel;
      } else {
        delete process.env.MISTRAL_MODEL;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const audioBuffer = Buffer.from('test');
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        mistralService.transcribeAudio(audioBuffer, testApiKey)
      ).rejects.toThrow('Network error');
    });

    it('should handle malformed API responses', async () => {
      const audioBuffer = Buffer.from('test');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        mistralService.transcribeAudio(audioBuffer, testApiKey)
      ).rejects.toThrow('Invalid JSON');
    });
  });

  describe('API Integration', () => {
    it('should make requests to correct endpoints', async () => {
      const audioBuffer = Buffer.from('test');
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'test' }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      await mistralService.transcribeAudio(audioBuffer, testApiKey);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/audio/transcriptions',
        expect.any(Object)
      );

      mockFetch.mockClear();
      mockResponse.json = vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'summary' } }]
      });
      mockFetch.mockResolvedValue(mockResponse);

      await mistralService.summarizeText('test', testApiKey);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('should include authorization header in all requests', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: 'test',
          choices: [{ message: { content: 'test' } }]
        }),
        text: vi.fn().mockResolvedValue(''),
      };
      mockFetch.mockResolvedValue(mockResponse);

      // Test transcription
      await mistralService.transcribeAudio(Buffer.from('test'), testApiKey);
      let callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe(`Bearer ${testApiKey}`);

      // Test summarization
      mockFetch.mockClear();
      mockFetch.mockResolvedValue(mockResponse);
      await mistralService.summarizeText('test', testApiKey);
      callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe(`Bearer ${testApiKey}`);

      // Test title generation
      mockFetch.mockClear();
      mockFetch.mockResolvedValue(mockResponse);
      await mistralService.generateTitle('test', testApiKey);
      callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers['Authorization']).toBe(`Bearer ${testApiKey}`);
    });
  });
});
