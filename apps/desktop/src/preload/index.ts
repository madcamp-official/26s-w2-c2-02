import { contextBridge } from 'electron';
import { lumiApi } from './lumi-api';

contextBridge.exposeInMainWorld('lumi', lumiApi);
