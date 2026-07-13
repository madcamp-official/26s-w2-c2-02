import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoomSnapshot } from '@roomi/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';
import { createApp } from './server';

describe('POST /rooms/:roomId/goals', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function postGoal(roomId: string, body: unknown) {
    return fetch(`${baseUrl}/rooms/${roomId}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('records a participant goal and returns the snapshot', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const response = await postGoal(created.room.id, {
      participantId: host.id,
      rawText: '수학 3단원'
    });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(response.status).toBe(200);
    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]?.rawText).toBe('수학 3단원');
  });

  it('upserts on repeated submissions from the same participant', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    await postGoal(created.room.id, { participantId: host.id, rawText: '수학' });

    const response = await postGoal(created.room.id, {
      participantId: host.id,
      rawText: '영어'
    });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]?.rawText).toBe('영어');
  });

  it('returns 404 for an unknown room', async () => {
    const response = await postGoal('missing-room', {
      participantId: 'x',
      rawText: '목표'
    });

    expect(response.status).toBe(404);
  });
});
