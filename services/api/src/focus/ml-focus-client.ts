export interface MlFocusPredictor {
  predict(featureWindow: unknown): Promise<unknown>;
  submitFeedback(feedback: unknown): Promise<unknown>;
  resetFeedback(userId: string): Promise<unknown>;
}

export class MlFocusUpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: 'unavailable' | 'timeout' | 'rejected',
    readonly status?: number,
    readonly detail?: unknown
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
        // A 4xx means the ML server understood the request and refused it, so the
        // caller sent a bad payload. Keep it distinct from a gateway failure.
        if (response.status < 500) {
          throw new MlFocusUpstreamError(
            `ML focus server rejected the request with ${response.status}`,
            'rejected',
            response.status,
            await readUpstreamDetail(response)
          );
        }

        throw new MlFocusUpstreamError(
          `ML focus server returned ${response.status}`,
          'unavailable',
          response.status
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

async function readUpstreamDetail(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
