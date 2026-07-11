import { createServer } from 'node:http';
import { createApp } from './server';
import { env } from './env';
import { registerRealtimeGateway } from './realtime/gateway';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';

const store = new InMemoryRoomStore();
const roomService = new RoomService(store);
const app = createApp(roomService);
const httpServer = createServer(app);

registerRealtimeGateway(httpServer, roomService);

httpServer.listen(env.port, () => {
  console.log(`Roomi API listening on http://localhost:${env.port}`);
});
