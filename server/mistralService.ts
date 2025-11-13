/**
 * MistralService
 *
 * Central service for all Mistral AI API interactions.
 * Encapsulates transcription, summarization, and title generation.
 * Implements dependency injection pattern for better testability and maintainability.
 */

export interface TranscriptionResult {
  text: string;
}

export interface SummarizationResult {
  summary: string;
}

export interface TitleGenerationResult {
  title: string;
}

export interface MistralConfig {
  apiKey: string;
  sttModel?: string;
  chatModel?: string;
}

/**
 * Interface for Mistral AI operations
 */
export interface IMistralService {
  /**
   * Transcribe audio using Mistral's Voxtral STT model
   * @param audioBuffer Audio data as Buffer
   * @param apiKey Mistral API key
   * @returns Transcription text
   */
  transcribeAudio(
    audioBuffer: Buffer,
    apiKey: string,
  ): Promise<TranscriptionResult>;

  /**
   * Generate summary from text using Mistral's chat model
   * @param text Text to summarize
   * @param apiKey Mistral API key
   * @param customTemplate Optional custom system prompt template
   * @returns Summary text
   */
  summarizeText(
    text: string,
    apiKey: string,
    customTemplate?: string,
  ): Promise<SummarizationResult>;

  /**
   * Generate a concise title from text using Mistral's chat model
   * @param text Text to generate title from
   * @param apiKey Mistral API key
   * @returns Generated title (max 60 characters)
   */
  generateTitle(text: string, apiKey: string): Promise<TitleGenerationResult>;
}

/**
 * Default implementation of Mistral AI service
 */
export class MistralService implements IMistralService {
  private readonly sttModel: string;
  private readonly chatModel: string;
  private readonly transcriptionUrl =
    "https://api.mistral.ai/v1/audio/transcriptions";
  private readonly chatUrl = "https://api.mistral.ai/v1/chat/completions";

  constructor(config?: { sttModel?: string; chatModel?: string }) {
    this.sttModel =
      config?.sttModel || process.env.MISTRAL_STT_MODEL || "voxtral-24.02";
    this.chatModel =
      config?.chatModel || process.env.MISTRAL_MODEL || "mistral-large-latest";
  }

  async transcribeAudio(
    audioBuffer: Buffer,
    apiKey: string,
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/webm" });
    formData.append("file", blob, "audio.webm");
    formData.append("model", this.sttModel);

    const response = await fetch(this.transcriptionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mistral transcription failed: ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    return { text: data.text };
  }

  async summarizeText(
    text: string,
    apiKey: string,
    customTemplate?: string,
  ): Promise<SummarizationResult> {
    const defaultTemplate =
      "Du bist ein Assistent, der Audio-Notizen zusammenfasst. Fasse mir den Inhalt so kurz wie möglich zusammen, in 1-2 Sätzen. was ist die Kernaussage ? Keine überschrifte, keine Formatierungen, kurz, prägnant und informativ.";
    const systemPrompt = customTemplate || defaultTemplate;

    const response = await fetch(this.chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Bitte fasse diese Notiz zusammen:\n\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mistral summarization failed: ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    return { summary: data.choices[0].message.content };
  }

  async generateTitle(
    text: string,
    apiKey: string,
  ): Promise<TitleGenerationResult> {
    const systemPrompt =
      "Du bist ein Redakteur, der einen kurzen und knackigen Titel für eine Notiz erstellt.";

    const response = await fetch(this.chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Erstelle einen kurzen und knackigen Titel für diese Notiz:\n\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mistral title generation failed: ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    let title = data.choices[0].message.content.trim();

    // Ensure title doesn't exceed 60 characters
    if (title.length > 60) {
      title = title.substring(0, 57) + "...";
    }

    return { title };
  }
}
