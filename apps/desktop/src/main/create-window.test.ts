// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWindow, shell } from 'electron';
import { createMainWindow } from './create-window';

const mocks = vi.hoisted(() => {
  const window = {
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    webContents: {
      setWindowOpenHandler: vi.fn()
    }
  };

  return { window };
});

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false }
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(() => mocks.window),
  shell: {
    openExternal: vi.fn()
  }
}));

describe('createMainWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the LumI desktop window with the preload bridge enabled', () => {
    createMainWindow({
      isDev: false,
      preloadPath: '/tmp/lumi-preload.js',
      rendererIndexPath: '/tmp/renderer/index.html'
    });

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1180,
        height: 760,
        minWidth: 960,
        minHeight: 640,
        title: 'LumI',
        webPreferences: {
          preload: '/tmp/lumi-preload.js',
          sandbox: false
        }
      })
    );
    expect(mocks.window.loadFile).toHaveBeenCalledWith('/tmp/renderer/index.html');
  });

  it('loads the renderer dev server in development mode', () => {
    createMainWindow({
      isDev: true,
      rendererUrl: 'http://localhost:5175'
    });

    expect(mocks.window.loadURL).toHaveBeenCalledWith('http://localhost:5175');
    expect(mocks.window.loadFile).not.toHaveBeenCalled();
  });

  it('opens external links in the system browser and blocks new Electron windows', () => {
    createMainWindow();

    const handler = mocks.window.webContents.setWindowOpenHandler.mock.calls[0][0];
    const result = handler({ url: 'https://example.com' });

    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
    expect(result).toEqual({ action: 'deny' });
  });
});
