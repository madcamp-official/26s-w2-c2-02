// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { configureAutoUpdates } from './auto-update';

function createUpdater() {
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    listeners,
    updater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
      }),
      checkForUpdatesAndNotify: vi.fn().mockResolvedValue(null),
      quitAndInstall: vi.fn()
    }
  };
}

describe('Roomi auto updater', () => {
  it('checks for updates only in an installed Windows app', () => {
    const { updater } = createUpdater();

    expect(
      configureAutoUpdates({
        isPackaged: true,
        platform: 'win32',
        updater,
        showMessageBox: vi.fn(),
        logger: { info: vi.fn(), error: vi.fn() }
      })
    ).toBe(true);

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledOnce();
  });

  it.each([
    { isPackaged: false, platform: 'win32' as const },
    { isPackaged: true, platform: 'darwin' as const }
  ])('skips update checks for $platform packaged=$isPackaged', ({ isPackaged, platform }) => {
    const { updater } = createUpdater();

    expect(
      configureAutoUpdates({
        isPackaged,
        platform,
        updater,
        showMessageBox: vi.fn(),
        logger: { info: vi.fn(), error: vi.fn() }
      })
    ).toBe(false);
    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it('installs the downloaded update when the user chooses restart', async () => {
    const { updater, listeners } = createUpdater();
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 });

    configureAutoUpdates({
      isPackaged: true,
      platform: 'win32',
      updater,
      showMessageBox,
      logger: { info: vi.fn(), error: vi.fn() }
    });
    await listeners.get('update-downloaded')?.({ version: '0.2.0' });

    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Roomi 0.2.0 업데이트를 설치할까요?' })
    );
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('keeps running when the user postpones installation', async () => {
    const { updater, listeners } = createUpdater();

    configureAutoUpdates({
      isPackaged: true,
      platform: 'win32',
      updater,
      showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
      logger: { info: vi.fn(), error: vi.fn() }
    });
    await listeners.get('update-downloaded')?.({ version: '0.2.0' });

    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
