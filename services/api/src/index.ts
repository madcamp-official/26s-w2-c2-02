import { createServer } from 'node:http';
import { createApp } from './server';
import { env } from './env';
import { registerRealtimeGateway } from './realtime/gateway';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';
import { DailyVideoProvider } from './video/daily-video-provider';
import { GeminiClient } from './roomi/gemini-client';
import { RoomiOrchestrator } from './roomi/roomi-orchestrator';
import { MlFocusClient } from './focus/ml-focus-client';

const store = new InMemoryRoomStore();
const roomService = new RoomService(store, new DailyVideoProvider());
// Set GEMINI_API_KEY, then optionally GEMINI_API_KEY_2/_3, to go live.
// Without configured keys the orchestrator falls back to templates.
const roomiOrchestrator = new RoomiOrchestrator(new GeminiClient({ apiKeys: env.geminiApiKeys }));
const mlFocusPredictor = new MlFocusClient({
  baseUrl: env.mlApiUrl,
  timeoutMs: env.mlApiTimeoutMs
});
const app = createApp(roomService, roomiOrchestrator, mlFocusPredictor);
const httpServer = createServer(app);

registerRealtimeGateway(httpServer, roomService, roomiOrchestrator);

httpServer.listen(env.port, env.host, () => {
  const displayHost = env.host === '0.0.0.0' ? 'localhost' : env.host;
  console.log(`Roomi API listening on http://${displayHost}:${env.port}`);
  console.log(`Roomi API bind host: ${env.host}`);
});
