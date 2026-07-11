// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge } from 'electron';
import { lumiApi } from './lumi-api';

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn()
  }
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exposes the LumI preload API to the renderer', async () => {
    await import('./index');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('lumi', lumiApi);
  });
});
