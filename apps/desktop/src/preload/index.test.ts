// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge, ipcRenderer } from 'electron';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn()
  },
  ipcRenderer: {
    invoke: vi.fn()
  }
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes the Roomi preload API to the renderer', async () => {
    await import('./index');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'roomi',
      expect.objectContaining({
        platform: process.platform,
        windowControls: {
          minimize: expect.any(Function),
          toggleMaximize: expect.any(Function),
          close: expect.any(Function)
        }
      })
    );

    const exposedApi = vi.mocked(contextBridge.exposeInMainWorld).mock.calls[0][1];
    await exposedApi.windowControls.minimize();
    await exposedApi.windowControls.toggleMaximize();
    await exposedApi.windowControls.close();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('window:minimize');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('window:toggle-maximize');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('window:close');
  });
});
