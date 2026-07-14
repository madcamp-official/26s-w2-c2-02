import { join } from 'node:path';

type Dock = { setIcon: (iconPath: string) => void };

export function roomiIconPath(options: {
  dirname: string;
  isPackaged: boolean;
  resourcesPath: string;
}) {
  return options.isPackaged
    ? join(options.resourcesPath, 'roomi-icon.png')
    : join(options.dirname, '../../resources/roomi-icon.png');
}

export function setMacDockIcon(platform: NodeJS.Platform, dock: Dock | undefined, iconPath: string) {
  if (platform === 'darwin') {
    dock?.setIcon(iconPath);
  }
}
