import type { TextGenerator } from './roomi-orchestrator';

const DEFAULT_MODEL = 'gemma3:4b';
const DEFAULT_TIMEOUT_MS = 8000;

export type OllamaClientOptions = {
  baseUrl: string | undefined;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
};

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class OllamaClient implements TextGenerator {
  private readonly baseUrl: string | undefined;
  private readonly model: string;
  private readonly temperature: number;
  private readonly timeoutMs: number;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl;
    this.model = options.model ?? DEFAULT_MODEL;
    this.temperature = options.temperature ?? 0.7;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('OLLAMA_BASE_URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: this.temperature
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status}`);
      }

      const data = (await response.json()) as ChatCompletionsResponse;
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('Ollama returned no text');
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
