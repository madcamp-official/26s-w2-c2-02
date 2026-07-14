import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaClient } from './ollama-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OllamaClient', () => {
  it('throws when no base URL is configured', async () => {
    const client = new OllamaClient({ baseUrl: undefined });

    await expect(client.generateText('prompt')).rejects.toThrow(/OLLAMA_BASE_URL/);
  });

  it('extracts the generated text from an Ollama response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ response: '다듬어진 목표' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new OllamaClient({ baseUrl: 'https://api.llm.madcamp-kaist.org', model: 'gemma3' });

    const text = await client.generateText('원본 목표');

    expect(text).toBe('다듬어진 목표');
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://api.llm.madcamp-kaist.org/api/generate');
    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body).toEqual({ model: 'gemma3', prompt: '원본 목표', stream: false });
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 429 }))
    );
    const client = new OllamaClient({ baseUrl: 'https://api.llm.madcamp-kaist.org' });

    await expect(client.generateText('원본')).rejects.toThrow(/429/);
  });
});
