import { afterEach, describe, expect, it, vi } from 'vitest';

async function createProvider() {
  vi.resetModules();
  vi.stubEnv('DAILY_API_KEY', 'daily-key');
  vi.stubEnv('DAILY_DOMAIN', 'roomi.daily.co');
  const { DailyVideoProvider } = await import('./daily-video-provider');
  return new DailyVideoProvider();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('DailyVideoProvider.deleteRoom', () => {
  it('deletes a Daily room by name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const provider = await createProvider();

    await provider.deleteRoom('roomi-room-1');

    expect(fetchMock).toHaveBeenCalledWith('https://api.daily.co/v1/rooms/roomi-room-1', {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer daily-key',
        'Content-Type': 'application/json'
      }
    });
  });

  it('treats an already deleted Daily room as cleaned up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const provider = await createProvider();

    await expect(provider.deleteRoom('missing-room')).resolves.toBeUndefined();
  });
});
