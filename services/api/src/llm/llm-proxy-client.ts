export interface LlmProxyResponse {
  status: number;
  contentType?: string;
  body: string;
}

export interface LlmProxy {
  forward(input: {
    method: string;
    path: string;
    body?: unknown;
  }): Promise<LlmProxyResponse>;
}

export class LlmProxyUpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'timeout'
  ) {
    super(message);
    this.name = 'LlmProxyUpstreamError';
  }
}

export class LlmProxyClient implements LlmProxy {
  constructor(
    private readonly options: {
      baseUrl: string;
      timeoutMs?: number;
      fetcher?: typeof fetch;
    }
  ) {}

  async forward(input: { method: string; path: string; body?: unknown }): Promise<LlmProxyResponse> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30000);
    const method = input.method.toUpperCase();
    const hasBody = input.body !== undefined && method !== 'GET' && method !== 'HEAD';

    try {
      const response = await (this.options.fetcher ?? fetch)(
        `${this.options.baseUrl.replace(/\/$/, '')}${input.path}`,
        {
          method,
          headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
          body: hasBody ? JSON.stringify(input.body) : undefined,
          signal: controller.signal
        }
      );

      return {
        status: response.status,
        contentType: response.headers.get('content-type') ?? undefined,
        body: await response.text()
      };
    } catch (_error) {
      if (controller.signal.aborted) {
        throw new LlmProxyUpstreamError('LLM server timed out', 'timeout');
      }
      throw new LlmProxyUpstreamError('LLM server is unavailable', 'unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
