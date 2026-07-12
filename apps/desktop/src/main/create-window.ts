import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { BrowserWindow, Menu, shell } from 'electron';

type CreateMainWindowOptions = {
  iconPath?: string;
  isDev?: boolean;
  preloadPath?: string;
  rendererIndexPath?: string;
  rendererUrl?: string;
};

export function createMainWindow(options: CreateMainWindowOptions = {}) {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 680,
    title: 'Roomi',
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f4f5f7',
    icon: options.iconPath ?? join(__dirname, '../../resources/roomi-icon.png'),
    webPreferences: {
      preload: options.preloadPath ?? join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDevelopment = options.isDev ?? is.dev;
  const rendererUrl = options.rendererUrl ?? process.env.ELECTRON_RENDERER_URL;

  if (isDevelopment && rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(options.rendererIndexPath ?? join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
