import { describe, expect, it, vi } from 'vitest';
import { MlFocusClient, MlFocusUpstreamError } from './ml-focus-client';

describe('MlFocusClient', () => {
  it('posts feature windows to the internal ML prediction endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ label: 'focused', score: 0.9 })
    });
    const client = new MlFocusClient({
      baseUrl: 'http://192.168.0.83:8080/',
      fetcher
    });

    await expect(client.predict({ windowId: 'window-1' })).resolves.toEqual({
      label: 'focused',
      score: 0.9
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.0.83:8080/v1/focus/predict',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ windowId: 'window-1' }) })
    );
  });

  it('posts user feedback to the internal ML feedback endpoint', async () => {
    const feedback = {
      windowId: 'window-1',
      predictedLabel: 'distracted',
      actualLabel: 'distracted',
      wasActuallyFocused: false
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true })
    });
    const client = new MlFocusClient({
      baseUrl: 'http://192.168.0.83:8080/',
      fetcher
    });

    await expect(client.submitFeedback(feedback)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.0.83:8080/v1/focus/feedback',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(feedback) })
    );
  });

  it('accepts empty ML feedback responses', async () => {
    const client = new MlFocusClient({
      baseUrl: 'http://192.168.0.83:8080/',
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        status: 204
      })
    });

    await expect(client.submitFeedback({ windowId: 'window-1' })).resolves.toEqual({ ok: true });
  });

  it('deletes feedback and calibration for one user through the internal ML endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: 'user/1',
        deletedFeedbackCount: 3,
        calibrationReset: true
      })
    });
    const client = new MlFocusClient({
      baseUrl: 'http://192.168.0.83:8080/',
      fetcher
    });

    await expect(client.resetFeedback('user/1')).resolves.toEqual({
      userId: 'user/1',
      deletedFeedbackCount: 3,
      calibrationReset: true
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.0.83:8080/v1/focus/feedback/user%2F1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('classifies an aborted upstream request as a timeout', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const client = new MlFocusClient({
      baseUrl: 'http://192.168.0.83:8080',
      timeoutMs: 1,
      fetcher
    });

    await expect(client.predict({ windowId: 'window-1' })).rejects.toMatchObject({
      kind: 'timeout'
    } satisfies Partial<MlFocusUpstreamError>);
  });
});
