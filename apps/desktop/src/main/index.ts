import { app, BrowserWindow, ipcMain, session, shell, systemPreferences } from 'electron';
import { createMainWindow } from './create-window';
import { roomiIconPath, setMacDockIcon } from './app-icon';

type MediaAccessResult = { camera: boolean; microphone: boolean };

/** 렌더러의 카메라·마이크 요청을 Electron 세션 레벨에서 허가한다. */
function enableMediaPermissions() {
  // getUserMedia 요청 단계 허가.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // getUserMedia는 요청 전에 권한 상태를 확인(check)한다.
  // 이 핸들러가 없으면 미디어 접근이 조용히 막혀 다이얼로그가 뜨지 않는다.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });
}

/**
 * macOS OS 레벨 카메라·마이크 접근을 확보한다.
 * 상태가 not-determined 이면 시스템 다이얼로그를 띄우고, 이미 결정된 상태면 즉시 반환한다.
 * darwin 이 아니면 항상 허용으로 간주한다.
 */
async function ensureMediaAccess(): Promise<MediaAccessResult> {
  if (process.platform !== 'darwin') {
    return { camera: true, microphone: true };
  }

  const [camera, microphone] = await Promise.all([
    systemPreferences.askForMediaAccess('camera'),
    systemPreferences.askForMediaAccess('microphone')
  ]);

  return { camera, microphone };
}

/** macOS 개인정보 보호 설정(카메라 창)을 연다. 사용자가 직접 권한을 켤 수 있도록. */
function openMediaPrivacySettings() {
  if (process.platform !== 'darwin') {
    return;
  }

  void shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
  );
}

ipcMain.handle('media:ensure-access', () => ensureMediaAccess());
ipcMain.handle('media:open-privacy-settings', () => {
  openMediaPrivacySettings();
});

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
});

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

app.whenReady().then(() => {
  const iconPath = roomiIconPath({
    dirname: __dirname,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  });
  setMacDockIcon(process.platform, app.dock, iconPath);
  enableMediaPermissions();
  createMainWindow({ iconPath });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ iconPath });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
