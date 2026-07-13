// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { roomiIconPath, setMacDockIcon } from './app-icon';

describe('Roomi application icon', () => {
  it('sets the Roomi icon on the macOS Dock', () => {
    const dock = { setIcon: vi.fn() };

    setMacDockIcon('darwin', dock, '/resources/roomi-icon.png');

    expect(dock.setIcon).toHaveBeenCalledWith('/resources/roomi-icon.png');
  });

  it('does not set a Dock icon on Windows', () => {
    const dock = { setIcon: vi.fn() };

    setMacDockIcon('win32', dock, '/resources/roomi-icon.png');

    expect(dock.setIcon).not.toHaveBeenCalled();
  });

  it('uses the packaged resources directory after installation', () => {
    expect(
      roomiIconPath({ dirname: '/app/out/main', isPackaged: true, resourcesPath: '/app/resources' })
    ).toBe(join('/app/resources', 'roomi-icon.png'));
  });
});
