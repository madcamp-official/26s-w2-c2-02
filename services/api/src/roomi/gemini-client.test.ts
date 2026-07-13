import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from './gemini-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiClient', () => {
  it('throws when no API key is configured', async () => {
    const client = new GeminiClient({ apiKey: undefined });

    await expect(client.generateText('prompt')).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('extracts the generated text from a Gemini response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '다듬어진 목표' }] } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new GeminiClient({ apiKey: 'test-key', model: 'gemini-2.5-flash' });

    const text = await client.generateText('원본 목표');

    expect(text).toBe('다듬어진 목표');
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('gemini-2.5-flash');
    expect(calledUrl).toContain('key=test-key');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 429 }))
    );
    const client = new GeminiClient({ apiKey: 'test-key' });

    await expect(client.generateText('원본')).rejects.toThrow(/429/);
  });
});
