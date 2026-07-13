import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoomSnapshot } from '@roomi/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';
import { RoomiOrchestrator, type TextGenerator } from './roomi/roomi-orchestrator';
import { createApp } from './server';

describe('POST /rooms/:roomId/goals', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService, new RoomiOrchestrator()));
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

describe('POST /sessions', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService, new RoomiOrchestrator()));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function startSession(body: unknown) {
    return fetch(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('starts the session for the host and returns the studying snapshot', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const response = await startSession({ roomId: created.room.id, participantId: host.id });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(response.status).toBe(200);
    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.currentSession?.mode).toBe('study');
  });

  it('returns 403 when a non-host tries to start', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const joined = roomService.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;

    const response = await startSession({ roomId: created.room.id, participantId: member.id });

    expect(response.status).toBe(403);
  });

  it('returns 409 when the session already started', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    await startSession({ roomId: created.room.id, participantId: host.id });

    const response = await startSession({ roomId: created.room.id, participantId: host.id });

    expect(response.status).toBe(409);
  });

  it('returns 404 for an unknown room', async () => {
    const response = await startSession({ roomId: 'missing', participantId: 'x' });

    expect(response.status).toBe(404);
  });
});

describe('POST /goals/refine', () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  async function startApp(orchestrator: RoomiOrchestrator) {
    httpServer = createServer(createApp(new RoomService(new InMemoryRoomStore()), orchestrator));
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function refine(body: unknown) {
    return fetch(`${baseUrl}/goals/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('returns 200 with a template refinement when no LLM is configured', async () => {
    await startApp(new RoomiOrchestrator());

    const response = await refine({ rawGoal: '수학', sessionMinutes: 25 });
    const body = (await response.json()) as { refinedText: string; source: string };

    expect(response.status).toBe(200);
    expect(body.source).toBe('template');
    expect(body.refinedText).toContain('수학');
  });

  it('returns the LLM refinement when a generator is configured', async () => {
    const generator: TextGenerator = { generateText: async () => '25분 집중: 수학 예제 3문제' };
    await startApp(new RoomiOrchestrator(generator));

    const response = await refine({ rawGoal: '수학', sessionMinutes: 25 });
    const body = (await response.json()) as { refinedText: string; source: string };

    expect(response.status).toBe(200);
    expect(body.source).toBe('gemini');
    expect(body.refinedText).toBe('25분 집중: 수학 예제 3문제');
  });
});
