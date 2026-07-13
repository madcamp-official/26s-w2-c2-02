import { ipcRenderer } from 'electron';

export type MediaAccessResult = { camera: boolean; microphone: boolean };

export type RoomiApi = {
  platform: NodeJS.Platform;
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  media: {
    ensureAccess: () => Promise<MediaAccessResult>;
    openPrivacySettings: () => Promise<void>;
  };
};

export const roomiApi: RoomiApi = {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },
  media: {
    ensureAccess: () => ipcRenderer.invoke('media:ensure-access'),
    openPrivacySettings: () => ipcRenderer.invoke('media:open-privacy-settings')
  }
};
