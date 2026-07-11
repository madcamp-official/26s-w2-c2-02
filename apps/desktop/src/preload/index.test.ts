// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextBridge } from 'electron';
import { roomiApi } from './roomi-api';

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

  it('exposes the Roomi preload API to the renderer', async () => {
    await import('./index');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('roomi', roomiApi);
  });
});
