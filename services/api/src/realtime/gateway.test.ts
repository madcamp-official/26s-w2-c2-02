import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { realtimeEvents, type RoomiMessage, type RoomSnapshot } from '@roomi/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from '../adapters/storage/in-memory-room-store';
import { RoomService } from '../rooms/room-service';
import { RoomiOrchestrator } from '../roomi/roomi-orchestrator';
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

  function subscribe(
    client: Socket,
    roomId: string,
    participantId: string
  ): Promise<RoomSnapshot | undefined> {
    return new Promise((resolve) => {
      client.emit(realtimeEvents.client.subscribeRoom, { roomId, participantId }, resolve);
    });
  }

  function once(client: Socket, event: string): Promise<RoomSnapshot> {
    return new Promise((resolve) => client.once(event, resolve));
  }

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer();
    registerRealtimeGateway(httpServer, roomService, new RoomiOrchestrator(), {
      focusRecoveryDelayMs: 0
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
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
    const snapshot = await subscribe(client, roomId, created.participants[0].id);

    expect(snapshot?.participants).toHaveLength(1);
    expect(snapshot?.participants[0]?.nickname).toBe('host');
  });

  it('broadcasts readiness changes to every subscribed socket', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const { id: roomId } = created.room;
    const hostId = created.participants[0].id;

    const [alice, bob] = await Promise.all([connectClient(), connectClient()]);
    await Promise.all([subscribe(alice, roomId, hostId), subscribe(bob, roomId, hostId)]);

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
    await Promise.all([subscribe(alice, roomId, hostId), subscribe(bob, roomId, hostId)]);

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

  it('delegates host to the earliest member when the host disconnects', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const joined = roomService.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const host = created.participants[0]!;
    const member = joined.participants.at(-1)!;
    const [hostClient, memberClient] = await Promise.all([connectClient(), connectClient()]);
    await Promise.all([
      subscribe(hostClient, created.room.id, host.id),
      subscribe(memberClient, created.room.id, member.id)
    ]);
    const update = once(memberClient, realtimeEvents.server.roomUpdated);

    hostClient.disconnect();

    const snapshot = await update;
    expect(snapshot.participants.find((participant) => participant.id === member.id)?.role).toBe('host');
    expect(snapshot.room.hostUserId).toBe(member.userId);
  });

  it('sends focus recovery messages only to the target participant', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const started = roomService.startSession(created.room.id, created.participants[0].id);
    const joined = roomService.joinRoom({ nickname: 'member', inviteCode: started.room.inviteCode });
    const member = joined.participants.at(-1)!;
    const [hostClient, memberClient] = await Promise.all([connectClient(), connectClient()]);
    await Promise.all([
      subscribe(hostClient, started.room.id, created.participants[0].id),
      subscribe(memberClient, started.room.id, member.id)
    ]);

    const message = new Promise<RoomiMessage>((resolve) =>
      memberClient.once(realtimeEvents.server.roomiMessage, resolve)
    );
    let hostReceivedMessage = false;
    hostClient.once(realtimeEvents.server.roomiMessage, () => {
      hostReceivedMessage = true;
    });

    memberClient.emit(realtimeEvents.client.updateStatus, {
      roomId: started.room.id,
      participantId: member.id,
      status: 'away'
    });

    const received = await message;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(received.kind).toBe('focus_recovery');
    expect(received.targetParticipantId).toBe(member.id);
    expect(hostReceivedMessage).toBe(false);

    const hostUpdate = once(hostClient, realtimeEvents.server.roomUpdated);
    const memberUpdate = once(memberClient, realtimeEvents.server.roomUpdated);
    hostClient.emit(realtimeEvents.client.participantReady, {
      roomId: started.room.id,
      participantId: created.participants[0].id,
      isReady: true
    });

    const [hostSnapshot, memberSnapshot] = await Promise.all([hostUpdate, memberUpdate]);
    expect(hostSnapshot.roomiMessages).toEqual([]);
    expect(memberSnapshot.roomiMessages).toHaveLength(1);
  });
});
