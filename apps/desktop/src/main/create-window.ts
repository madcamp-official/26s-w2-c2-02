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
    // frame:false 만 사용한다. macOS에서 titleBarStyle:'hidden' 을 함께 주면
    // 네이티브 신호등 버튼이 그대로 표시되어 커스텀 타이틀바와 겹친다.
    frame: false,
    // 스플래시가 떠 있는 동안 빈 메인 창이 깜빡이지 않도록 준비될 때까지 숨긴다.
    // 호출자가 'ready-to-show' 시점에 show() 한다.
    show: false,
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
