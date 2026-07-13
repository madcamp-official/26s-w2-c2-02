type UpdateEvent = 'update-downloaded' | 'error';

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: UpdateEvent, listener: (...args: any[]) => void): unknown;
  checkForUpdatesAndNotify(): Promise<unknown>;
  quitAndInstall(): void;
};

type MessageBoxResult = { response: number };

type ShowMessageBox = (options: {
  type: 'info';
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
}) => Promise<MessageBoxResult>;

type Logger = Pick<Console, 'error' | 'info'>;

type ConfigureAutoUpdatesOptions = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  updater: AutoUpdaterLike;
  showMessageBox: ShowMessageBox;
  logger?: Logger;
};

/** 설치된 Windows 앱에서 GitHub Releases를 확인하고 새 버전을 자동 다운로드한다. */
export function configureAutoUpdates({
  isPackaged,
  platform,
  updater,
  showMessageBox,
  logger = console
}: ConfigureAutoUpdatesOptions): boolean {
  if (!isPackaged || platform !== 'win32') {
    return false;
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-downloaded', (updateInfo: { version?: string }) => {
    void (async () => {
      const version = updateInfo.version ? ` ${updateInfo.version}` : '';
      const { response } = await showMessageBox({
        type: 'info',
        title: 'Roomi 업데이트 준비 완료',
        message: `Roomi${version} 업데이트를 설치할까요?`,
        detail: '지금 재시작하면 새 버전이 기존 설치 위에 자동으로 적용됩니다.',
        buttons: ['지금 재시작', '나중에'],
        defaultId: 0,
        cancelId: 1
      });

      if (response === 0) {
        updater.quitAndInstall();
      }
    })().catch((error: unknown) => {
      logger.error('Roomi 업데이트 설치 안내를 표시하지 못했습니다.', error);
    });
  });

  updater.on('error', (error: unknown) => {
    logger.error('Roomi 자동 업데이트 확인에 실패했습니다.', error);
  });

  void updater.checkForUpdatesAndNotify().catch((error: unknown) => {
    logger.error('Roomi 자동 업데이트 요청에 실패했습니다.', error);
  });
  logger.info('Roomi 자동 업데이트 확인을 시작했습니다.');
  return true;
}
