import type { TextGenerator } from './roomi-orchestrator';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiClientOptions = {
  apiKey?: string;
  apiKeys?: string[];
  model?: string;
  timeoutMs?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export class GeminiClient implements TextGenerator {
  private readonly apiKeys: string[];
  private readonly model: string;
  private readonly timeoutMs: number | undefined;

  constructor(options: GeminiClientOptions) {
    this.apiKeys = (options.apiKeys ?? [options.apiKey]).filter(
      (apiKey): apiKey is string => Boolean(apiKey)
    );
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs;
  }

  async generateText(prompt: string): Promise<string> {
    if (this.apiKeys.length === 0) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    let lastError: unknown;

    for (let index = 0; index < this.apiKeys.length; index += 1) {
      try {
        return await this.generateTextWithKey(prompt, this.apiKeys[index], index + 1);
      } catch (error) {
        lastError = error;
        this.logKeyFailure(index + 1, error, index < this.apiKeys.length - 1);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`All configured Gemini API keys failed: ${message}`);
  }

  private async generateTextWithKey(prompt: string, apiKey: string, keyNumber: number): Promise<string> {
    if (!apiKey) {
      throw new Error(`GEMINI_API_KEY_${keyNumber} is not configured`);
    }

    const controller = this.timeoutMs ? new AbortController() : undefined;
    const timeout = controller
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined;

    try {
      const response = await fetch(
        `${ENDPOINT}/${this.model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: controller?.signal
        }
      );

      if (!response.ok) {
        const body = await this.safeReadErrorBody(response);
        throw new Error(
          `Gemini key #${keyNumber} request failed: ${response.status}${body ? ` - ${body}` : ''}`
        );
      }

      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('Gemini returned no text');
      }

      return text;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private logKeyFailure(keyNumber: number, error: unknown, willRetry: boolean): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[GeminiClient] Gemini key #${keyNumber} failed: ${message}${
        willRetry ? ' Trying next configured key.' : ''
      }`
    );
  }

  private async safeReadErrorBody(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 500);
    } catch {
      return '';
    }
  }
}
