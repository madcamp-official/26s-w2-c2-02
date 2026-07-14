import { describe, expect, it, vi } from 'vitest';
import { MlFocusClient, MlFocusUpstreamError } from './ml-focus-client';

describe('MlFocusClient', () => {
  it('posts feature windows to the internal ML prediction endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ label: 'focused', score: 0.9 })
    });
    const client = new MlFocusClient({
      baseUrl: 'http://170.10.5.140:8080/',
      fetcher
    });

    await expect(client.predict({ windowId: 'window-1' })).resolves.toEqual({
      label: 'focused',
      score: 0.9
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://170.10.5.140:8080/v1/focus/predict',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ windowId: 'window-1' }) })
    );
  });

  it('classifies an aborted upstream request as a timeout', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const client = new MlFocusClient({
      baseUrl: 'http://170.10.5.140:8080',
      timeoutMs: 1,
      fetcher
    });

    await expect(client.predict({ windowId: 'window-1' })).rejects.toMatchObject({
      kind: 'timeout'
    } satisfies Partial<MlFocusUpstreamError>);
  });
});
