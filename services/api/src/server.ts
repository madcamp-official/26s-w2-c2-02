import cors from 'cors';
import express from 'express';
import type { CreateRoomInput, JoinRoomInput } from '@roomi/shared';
import { env } from './env';
import type { RoomService } from './rooms/room-service';

export function createApp(roomService: RoomService) {
  const app = express();

  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'roomi-api' });
  });

  app.post('/rooms', (request, response) => {
    const snapshot = roomService.createRoom(request.body as CreateRoomInput);
    response.status(201).json(snapshot);
  });

  app.post('/rooms/join', (request, response) => {
    const snapshot = roomService.joinRoom(request.body as JoinRoomInput);
    response.json(snapshot);
  });

  app.get('/rooms/:inviteCode', (request, response) => {
    const snapshot = roomService.getByInviteCode(request.params.inviteCode);

    if (!snapshot) {
      response.status(404).json({ message: 'Room not found' });
      return;
    }

    response.json(snapshot);
  });

  return app;
}
