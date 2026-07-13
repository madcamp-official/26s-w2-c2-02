import { createServer } from 'node:http';
import { createApp } from './server';
import { env } from './env';
import { registerRealtimeGateway } from './realtime/gateway';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';
import { DailyVideoProvider } from './video/daily-video-provider';
import { GeminiClient } from './roomi/gemini-client';
import { RoomiOrchestrator } from './roomi/roomi-orchestrator';

const store = new InMemoryRoomStore();
const roomService = new RoomService(store, new DailyVideoProvider());
// Set GEMINI_API_KEY to go live; without it the orchestrator falls back to templates.
const roomiOrchestrator = new RoomiOrchestrator(new GeminiClient({ apiKey: env.geminiApiKey }));
const app = createApp(roomService, roomiOrchestrator);
const httpServer = createServer(app);

registerRealtimeGateway(httpServer, roomService);

httpServer.listen(env.port, env.host, () => {
  const displayHost = env.host === '0.0.0.0' ? 'localhost' : env.host;
  console.log(`Roomi API listening on http://${displayHost}:${env.port}`);
  console.log(`Roomi API bind host: ${env.host}`);
});
