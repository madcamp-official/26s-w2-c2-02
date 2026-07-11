import { contextBridge } from 'electron';
import { roomiApi } from './roomi-api';

contextBridge.exposeInMainWorld('roomi', roomiApi);
