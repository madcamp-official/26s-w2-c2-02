export interface MlFocusPredictor {
  predict(featureWindow: unknown): Promise<unknown>;
  submitFeedback(feedback: unknown): Promise<unknown>;
  resetFeedback(userId: string): Promise<unknown>;
}

export class MlFocusUpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'timeout'
  ) {
    super(message);
    this.name = 'MlFocusUpstreamError';
  }
}

export class MlFocusClient implements MlFocusPredictor {
  constructor(
    private readonly options: {
      baseUrl: string;
      timeoutMs?: number;
      fetcher?: typeof fetch;
    }
  ) {}

  async predict(featureWindow: unknown): Promise<unknown> {
    return this.postToMlServer('/v1/focus/predict', featureWindow);
  }

  async submitFeedback(feedback: unknown): Promise<unknown> {
    return this.postToMlServer('/v1/focus/feedback', feedback);
  }

  async resetFeedback(userId: string): Promise<unknown> {
    return this.requestMlServer(
      `/v1/focus/feedback/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  }

  private async postToMlServer(path: string, body: unknown): Promise<unknown> {
    return this.requestMlServer(path, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  private async requestMlServer(
    path: string,
    init: { method: 'POST' | 'DELETE'; body?: string }
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);

    try {
      const response = await (this.options.fetcher ?? fetch)(
        `${this.options.baseUrl.replace(/\/$/, '')}${path}`,
        {
          method: init.method,
          headers: { 'Content-Type': 'application/json' },
          body: init.body,
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new MlFocusUpstreamError(
          `ML focus server returned ${response.status}`,
          'unavailable'
        );
      }

      if (response.status === 204) {
        return { ok: true };
      }

      return await response.json();
    } catch (error) {
      if (error instanceof MlFocusUpstreamError) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new MlFocusUpstreamError('ML focus server timed out', 'timeout');
      }
      throw new MlFocusUpstreamError('ML focus server is unavailable', 'unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
