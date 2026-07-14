import type { TextGenerator } from './roomi-orchestrator';

const DEFAULT_MODEL = 'gemma3';
const DEFAULT_TIMEOUT_MS = 8000;

export type OllamaClientOptions = {
  baseUrl: string | undefined;
  model?: string;
  timeoutMs?: number;
};

type OllamaResponse = {
  response?: string;
};

export class OllamaClient implements TextGenerator {
  private readonly baseUrl: string | undefined;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl;
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('OLLAMA_BASE_URL is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status}`);
      }

      const data = (await response.json()) as OllamaResponse;

      if (!data.response) {
        throw new Error('Ollama returned no text');
      }

      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
