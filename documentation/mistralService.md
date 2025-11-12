# MistralService Documentation

## Overview

The `MistralService` is a centralized service that encapsulates all interactions with the Mistral AI API. It provides a clean, testable interface for audio transcription, text summarization, and title generation. The service implements the dependency injection pattern to improve code maintainability and reduce redundancy across the application.

## Architecture

### Design Principles

1. **Single Responsibility**: All Mistral API interactions are consolidated in one service
2. **Dependency Injection**: Service is injected into components that need it (routes, background worker)
3. **Interface-based Design**: `IMistralService` interface allows for easy mocking and testing
4. **Error Handling**: Comprehensive error handling with meaningful error messages
5. **Configuration Management**: Centralized configuration for API models and endpoints

### Class Structure

```typescript
interface IMistralService {
  transcribeAudio(audioBuffer: Buffer, apiKey: string): Promise<TranscriptionResult>;
  summarizeText(text: string, apiKey: string, customTemplate?: string): Promise<SummarizationResult>;
  generateTitle(text: string, apiKey: string): Promise<TitleGenerationResult>;
}

class MistralService implements IMistralService {
  constructor(config?: { sttModel?: string; chatModel?: string })
}
```

## Features

### 1. Audio Transcription

Transcribes audio files using Mistral's Voxtral STT model.

**Method**: `transcribeAudio(audioBuffer: Buffer, apiKey: string): Promise<TranscriptionResult>`

**Parameters**:
- `audioBuffer`: Audio data as a Node.js Buffer
- `apiKey`: User's Mistral API key (BYOK - Bring Your Own Key)

**Returns**: `{ text: string }` - The transcribed text

**Example**:
```typescript
const audioBuffer = Buffer.from(audioData, 'base64');
const result = await mistralService.transcribeAudio(audioBuffer, userApiKey);
console.log(result.text); // "Transcribed audio content..."
```

### 2. Text Summarization

Generates structured summaries from text using Mistral's chat completion model.

**Method**: `summarizeText(text: string, apiKey: string, customTemplate?: string): Promise<SummarizationResult>`

**Parameters**:
- `text`: The text to summarize
- `apiKey`: User's Mistral API key
- `customTemplate`: Optional custom system prompt for summary generation

**Returns**: `{ summary: string }` - The generated summary in Markdown format

**Example**:
```typescript
const summary = await mistralService.summarizeText(
  transcribedText,
  userApiKey,
  customTemplate // Optional: user's custom summarization instructions
);
console.log(summary.summary); // "## Zusammenfassung\n\n- Punkt 1\n- Punkt 2..."
```

### 3. Title Generation

Creates concise, descriptive titles from text (max 60 characters).

**Method**: `generateTitle(text: string, apiKey: string): Promise<TitleGenerationResult>`

**Parameters**:
- `text`: The text to generate a title from
- `apiKey`: User's Mistral API key

**Returns**: `{ title: string }` - A concise title (automatically truncated if > 60 chars)

**Example**:
```typescript
const result = await mistralService.generateTitle(transcribedText, userApiKey);
console.log(result.title); // "Projektbesprechung AI-Features"
```

## Integration

### Dependency Injection

The service is instantiated once as a singleton and injected into components:

```typescript
// server/routes.ts
const mistralService = new MistralService();
const transcriptionWorker = new TranscriptionWorker(jobQueue, storage, mistralService);
```

### Usage in Routes

The service is used in the synchronous transcription endpoint:

```typescript
app.post('/api/recordings/:id/transcribe', requireAuth, async (req, res) => {
  // ... validation code ...
  
  const transcriptionResult = await mistralService.transcribeAudio(audioBuffer, settings.mistralApiKey);
  const summaryResult = await mistralService.summarizeText(transcript, settings.mistralApiKey);
  const titleResult = await mistralService.generateTitle(transcript, settings.mistralApiKey);
  
  // ... update recording with results ...
});
```

### Usage in Background Worker

The service is used by the background transcription worker:

```typescript
class TranscriptionWorker {
  constructor(jobQueue: JobQueue, storage: IStorage, mistralService: IMistralService) {
    this.mistralService = mistralService;
  }
  
  private async transcribeRecording(recordingId: string, userId: string): Promise<void> {
    const transcriptionResult = await this.mistralService.transcribeAudio(audioBuffer, apiKey);
    const summaryResult = await this.mistralService.summarizeText(transcript, apiKey);
    const titleResult = await this.mistralService.generateTitle(transcript, apiKey);
  }
}
```

## Configuration

### Model Selection

The service supports configurable models through constructor parameters or environment variables:

**Constructor Configuration**:
```typescript
const mistralService = new MistralService({
  sttModel: 'custom-voxtral-model',
  chatModel: 'custom-chat-model'
});
```

**Environment Variables**:
- `MISTRAL_STT_MODEL`: Speech-to-text model (default: `voxtral-24.02`)
- `MISTRAL_MODEL`: Chat completion model (default: `mistral-large-latest`)

### API Endpoints

The service communicates with these Mistral API endpoints:
- Transcription: `https://api.mistral.ai/v1/audio/transcriptions`
- Chat Completions: `https://api.mistral.ai/v1/chat/completions`

## Error Handling

All methods throw descriptive errors when API calls fail:

```typescript
try {
  const result = await mistralService.transcribeAudio(audioBuffer, apiKey);
} catch (error) {
  // Error message format: "Mistral transcription failed: [statusText] - [errorDetails]"
  console.error(error.message);
}
```

Common error scenarios:
- **Invalid API Key**: `401 Unauthorized`
- **Rate Limiting**: `429 Too Many Requests`
- **Network Issues**: Connection/timeout errors
- **Invalid Input**: `400 Bad Request`

## Race Conditions and Thread Safety

### Problem Analysis

The background worker (`TranscriptionWorker`) processes transcription jobs asynchronously while the application may receive new jobs concurrently. Potential race conditions include:

1. Multiple jobs queued while worker is processing
2. User-initiated transcription while background worker is active
3. Concurrent API requests to Mistral

### Mitigation Strategies

#### 1. Queue-Based Processing

The `JobQueue` system ensures sequential job processing:
- Jobs are dequeued one at a time
- Each job is marked as "in progress" before processing
- Failed jobs are requeued with attempt tracking
- Maximum retry limit prevents infinite loops

#### 2. Service Instance Thread Safety

The `MistralService` is **stateless** and **thread-safe**:
- No shared mutable state
- Each API call is independent
- API keys are passed per request (BYOK model)
- No internal caching or state management

#### 3. Worker State Management

The `TranscriptionWorker` uses flags to prevent concurrent execution:

```typescript
private isProcessing = false;

async notifyNewJob(): Promise<void> {
  if (this.isProcessing) {
    // New job will be picked up in next iteration
    return;
  }
  this.isProcessing = true;
  await this.processQueue();
  this.isProcessing = false;
}
```

#### 4. Database Locking

Recording status updates provide optimistic locking:
- Status: `pending` → `transcribing` → `transcribed`
- Failed jobs marked as `failed`
- Status prevents duplicate processing

### Best Practices

1. **API Key per Request**: Using BYOK (Bring Your Own Key) prevents API key sharing issues
2. **Idempotent Operations**: Mistral API calls are idempotent—safe to retry
3. **Error Isolation**: Service errors don't affect other jobs in queue
4. **Graceful Degradation**: Title generation failures don't block transcription

## Testing

### Unit Tests

The service includes comprehensive unit tests (`tests/mistralService.test.ts`) covering:

#### Test Categories

1. **Audio Transcription Tests** (3 tests)
   - Successful transcription
   - API failure handling
   - Empty audio buffer handling

2. **Text Summarization Tests** (4 tests)
   - Default template usage
   - Custom template usage
   - API failure handling
   - Empty text handling

3. **Title Generation Tests** (4 tests)
   - Successful title generation
   - Title truncation (> 60 chars)
   - Whitespace trimming
   - API failure handling

4. **Configuration Tests** (3 tests)
   - Default model configuration
   - Custom model configuration
   - Environment variable configuration

5. **Error Handling Tests** (2 tests)
   - Network error handling
   - Malformed API response handling

6. **API Integration Tests** (2 tests)
   - Correct endpoint usage
   - Authorization header inclusion

### Test Quality Metrics

- **Total Tests**: 18 high-quality tests
- **Coverage**: All public methods and error paths
- **Mock Strategy**: Fetch API mocked for isolated testing
- **Assertions**: Clear, meaningful assertions for each scenario

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test mistralService.test.ts

# Run with coverage
npm run test:coverage
```

### Test Example

```typescript
it('should successfully transcribe audio', async () => {
  const audioBuffer = Buffer.from('test audio data');
  const mockResponse = {
    ok: true,
    json: vi.fn().mockResolvedValue({ text: 'Transcribed text content' }),
  };
  mockFetch.mockResolvedValue(mockResponse);

  const result = await mistralService.transcribeAudio(audioBuffer, testApiKey);

  expect(result.text).toBe('Transcribed text content');
  expect(mockFetch).toHaveBeenCalledWith(
    'https://api.mistral.ai/v1/audio/transcriptions',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${testApiKey}` },
    })
  );
});
```

## Benefits of Refactoring

### Before Refactoring
- Duplicate Mistral API code in `routes.ts` and `transcriptionWorker.ts`
- Hardcoded API endpoints and request logic in multiple places
- Difficult to test components that make API calls
- No centralized error handling
- Configuration scattered across files

### After Refactoring
- ✅ Single source of truth for Mistral API interactions
- ✅ Reusable service across application
- ✅ Easy to mock for testing
- ✅ Centralized error handling
- ✅ Clear interface and documentation
- ✅ Improved maintainability
- ✅ Better separation of concerns

## Future Enhancements

Potential improvements for the service:

1. **Caching**: Cache API responses to reduce costs (with TTL)
2. **Rate Limiting**: Built-in rate limit handling and backoff
3. **Batch Processing**: Support for batch transcription
4. **Streaming**: Support for streaming responses
5. **Analytics**: Track API usage per user
6. **Cost Estimation**: Provide cost estimates before API calls
7. **Multi-language Support**: Configurable language detection and translation

## Migration Guide

If you need to add new Mistral API functionality:

1. Add method to `IMistralService` interface
2. Implement method in `MistralService` class
3. Add comprehensive unit tests
4. Update this documentation
5. Use the new method in routes/worker via dependency injection

## Conclusion

The `MistralService` provides a robust, maintainable, and testable solution for integrating Mistral AI capabilities into the application. Through dependency injection and clear interface design, it eliminates code duplication and provides a foundation for future AI feature enhancements.
