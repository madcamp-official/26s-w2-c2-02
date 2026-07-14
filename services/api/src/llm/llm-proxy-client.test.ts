import { describe, expect, it, vi } from 'vitest';
import { LlmProxyClient, LlmProxyUpstreamError } from './llm-proxy-client';

describe('LlmProxyClient', () => {
  it('forwards OpenAI-compatible chat completion requests to the configured LLM server', async () => {
    const body = {
      model: 'gemma3:4b',
      messages: [{ role: 'user', content: '안녕' }]
    };
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"choices":[{"message":{"content":"안녕!"}}]}'
    });
    const client = new LlmProxyClient({
      baseUrl: 'http://192.168.0.83:8081/',
      fetcher
    });

    await expect(
      client.forward({ method: 'POST', path: '/v1/chat/completions', body })
    ).resolves.toEqual({
      status: 200,
      contentType: 'application/json',
      body: '{"choices":[{"message":{"content":"안녕!"}}]}'
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.0.83:8081/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    );
  });

  it('forwards model list requests without a request body', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"object":"list","data":[]}'
    });
    const client = new LlmProxyClient({
      baseUrl: 'http://192.168.0.83:8081',
      fetcher
    });

    await client.forward({ method: 'GET', path: '/v1/models' });

    expect(fetcher).toHaveBeenCalledWith(
      'http://192.168.0.83:8081/v1/models',
      expect.objectContaining({
        method: 'GET',
        body: undefined
      })
    );
  });

  it('classifies an aborted upstream request as a timeout', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const client = new LlmProxyClient({
      baseUrl: 'http://192.168.0.83:8081',
      timeoutMs: 1,
      fetcher
    });

    await expect(
      client.forward({ method: 'POST', path: '/v1/chat/completions', body: {} })
    ).rejects.toMatchObject({
      kind: 'timeout'
    } satisfies Partial<LlmProxyUpstreamError>);
  });
});
