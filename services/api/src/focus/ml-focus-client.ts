export interface MlFocusPredictor {
  predict(featureWindow: unknown): Promise<unknown>;
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
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5000);

    try {
      const response = await (this.options.fetcher ?? fetch)(
        `${this.options.baseUrl.replace(/\/$/, '')}/v1/focus/predict`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(featureWindow),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new MlFocusUpstreamError(
          `ML focus server returned ${response.status}`,
          'unavailable'
        );
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
