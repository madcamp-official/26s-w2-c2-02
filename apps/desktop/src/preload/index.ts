import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('lumi', {
  platform: process.platform
});
