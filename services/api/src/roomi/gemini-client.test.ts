import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiClient } from './gemini-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 429 }))
    );
    const client = new GeminiClient({ apiKey: 'test-key' });

    await expect(client.generateText('원본')).rejects.toThrow(/429 - nope/);
  });

  it('tries the next configured key when an earlier key fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '두 번째 키 성공' }] } }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new GeminiClient({
      apiKeys: ['first-key', 'second-key', 'third-key'],
      model: 'gemini-2.5-flash'
    });

    const text = await client.generateText('원본 목표');

    expect(text).toBe('두 번째 키 성공');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('key=first-key');
    expect(fetchMock.mock.calls[1][0]).toContain('key=second-key');
    expect(consoleError).toHaveBeenCalledWith(
      '[GeminiClient] Gemini key #1 failed: Gemini key #1 request failed: 429 - quota exceeded Trying next configured key.'
    );
  });
});
