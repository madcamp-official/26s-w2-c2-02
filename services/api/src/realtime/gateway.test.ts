import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { realtimeEvents, type RoomSnapshot } from '@roomi/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from '../adapters/storage/in-memory-room-store';
import { RoomService } from '../rooms/room-service';
import { registerRealtimeGateway } from './gateway';

describe('realtime gateway', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let client: Socket;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer();
    registerRealtimeGateway(httpServer, roomService);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));

    const { port } = httpServer.address() as AddressInfo;
    client = createClient(`http://localhost:${port}`, {
      transports: ['websocket']
    });
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));
  });

  afterEach(async () => {
    client.disconnect();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('does not let a socket create a participant (membership is REST-only)', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const { id: roomId, inviteCode } = created.room;

    // The legacy 'room:join' event was removed from the contract. Even if an old
    // client still emits it, the gateway must NOT add a participant — membership
    // is REST-only.
    client.emit('room:join', { nickname: 'intruder', inviteCode });

    // room:subscribe is ordered after the emit above on the same socket, so its
    // ack reflects room state once any join handler would have run.
    const snapshot = await new Promise<RoomSnapshot | undefined>((resolve) => {
      client.emit(realtimeEvents.client.subscribeRoom, roomId, resolve);
    });

    expect(snapshot?.participants).toHaveLength(1);
    expect(snapshot?.participants[0]?.nickname).toBe('host');
  });
});
