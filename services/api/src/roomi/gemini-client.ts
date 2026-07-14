import type { TextGenerator } from './roomi-orchestrator';

const DEFAULT_MODEL = 'gemma-3-27b-it';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 8000;

export type GeminiClientOptions = {
  apiKey: string | undefined;
  model?: string;
  timeoutMs?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
};

export class GeminiClient implements TextGenerator {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${ENDPOINT}/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini request failed: ${response.status}`);
      }

      const data = (await response.json()) as GeminiResponse;
      // Thinking models (e.g. Gemini 2.5+) emit a reasoning part with
      // thought: true ahead of the actual answer part; skip it.
      const text = data.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        throw new Error('Gemini returned no text');
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
