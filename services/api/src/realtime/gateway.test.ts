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
  let port: number;
  const clients: Socket[] = [];

  function connectClient(): Promise<Socket> {
    const client = createClient(`http://localhost:${port}`, {
      transports: ['websocket']
    });
    clients.push(client);
    return new Promise((resolve) => client.on('connect', () => resolve(client)));
  }

  function subscribe(client: Socket, roomId: string): Promise<RoomSnapshot | undefined> {
    return new Promise((resolve) => {
      client.emit(realtimeEvents.client.subscribeRoom, roomId, resolve);
    });
  }

  function once(client: Socket, event: string): Promise<RoomSnapshot> {
    return new Promise((resolve) => client.once(event, resolve));
  }

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer();
    registerRealtimeGateway(httpServer, roomService);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    clients.length = 0;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('does not let a socket create a participant (membership is REST-only)', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const { id: roomId, inviteCode } = created.room;
    const client = await connectClient();

    // The legacy 'room:join' event was removed from the contract. Even if an old
    // client still emits it, the gateway must NOT add a participant — membership
    // is REST-only.
    client.emit('room:join', { nickname: 'intruder', inviteCode });

    // room:subscribe is ordered after the emit above on the same socket, so its
    // ack reflects room state once any join handler would have run.
    const snapshot = await subscribe(client, roomId);

    expect(snapshot?.participants).toHaveLength(1);
    expect(snapshot?.participants[0]?.nickname).toBe('host');
  });

  it('broadcasts readiness changes to every subscribed socket', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const { id: roomId } = created.room;
    const hostId = created.participants[0].id;

    const [alice, bob] = await Promise.all([connectClient(), connectClient()]);
    await Promise.all([subscribe(alice, roomId), subscribe(bob, roomId)]);

    const aliceUpdate = once(alice, realtimeEvents.server.roomUpdated);
    const bobUpdate = once(bob, realtimeEvents.server.roomUpdated);

    alice.emit(realtimeEvents.client.participantReady, {
      roomId,
      participantId: hostId,
      isReady: true
    });

    const [aliceSnapshot, bobSnapshot] = await Promise.all([aliceUpdate, bobUpdate]);

    expect(aliceSnapshot.participants[0]?.isReady).toBe(true);
    expect(bobSnapshot.participants[0]?.isReady).toBe(true);
  });

  it('broadcasts goal submissions to every subscribed socket', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const { id: roomId } = created.room;
    const hostId = created.participants[0].id;

    const [alice, bob] = await Promise.all([connectClient(), connectClient()]);
    await Promise.all([subscribe(alice, roomId), subscribe(bob, roomId)]);

    const bobUpdate = once(bob, realtimeEvents.server.roomUpdated);

    alice.emit(realtimeEvents.client.submitGoal, {
      roomId,
      participantId: hostId,
      rawText: '수학 3단원'
    });

    const bobSnapshot = await bobUpdate;

    expect(bobSnapshot.goals).toHaveLength(1);
    expect(bobSnapshot.goals[0]?.rawText).toBe('수학 3단원');
  });
});
