import cors from 'cors';
import express from 'express';
import type { CreateRoomInput, JoinRoomInput } from '@roomi/shared';
import { isAllowedClientOrigin } from './env';
import type { RoomService } from './rooms/room-service';

export function createApp(roomService: RoomService) {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, isAllowedClientOrigin(origin));
      }
    })
  );
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'roomi-api' });
  });

  app.post('/rooms', async (request, response) => {
    try {
      const session = await roomService.createRoomSession(request.body as CreateRoomInput);
      response.status(201).json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid room';
      response.status(statusForRoomError(message, 400)).json({ message });
    }
  });

  app.post('/rooms/join', async (request, response) => {
    try {
      const session = await roomService.joinRoomSession(request.body as JoinRoomInput);
      response.json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Room join failed';
      response.status(statusForRoomError(message, 404)).json({ message });
    }
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

function statusForRoomError(message: string, fallback: number) {
  if (message === 'Room is full') {
    return 409;
  }

  if (message.startsWith('Daily') || message.startsWith('DAILY_')) {
    return 503;
  }

  return fallback;
}
