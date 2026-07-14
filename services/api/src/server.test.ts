import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoomiMessage, RoomSnapshot } from '@roomi/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRoomStore } from './adapters/storage/in-memory-room-store';
import { RoomService } from './rooms/room-service';
import { RoomiOrchestrator, type TextGenerator } from './roomi/roomi-orchestrator';
import { createApp } from './server';
import { MlFocusUpstreamError, type MlFocusPredictor } from './focus/ml-focus-client';
import { LlmProxyUpstreamError, type LlmProxy } from './llm/llm-proxy-client';

describe('POST /rooms/:roomId/goals', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService, new RoomiOrchestrator()));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
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
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
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
    const messages: RoomiMessage[] = [];
    roomService.onRoomiMessage((message) => messages.push(message));

    const response = await startSession({ roomId: created.room.id, participantId: host.id });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(response.status).toBe(200);
    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.currentSession?.mode).toBe('study');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.kind).toBe('start');
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

describe('POST /sessions/end', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  async function startApp(orchestrator: RoomiOrchestrator) {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService, orchestrator));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  }

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function endSession(body: unknown) {
    return fetch(`${baseUrl}/sessions/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('ends the session and returns a snapshot with an attached summary', async () => {
    await startApp(new RoomiOrchestrator());
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    roomService.startSession(created.room.id, host.id);
    const messages: RoomiMessage[] = [];
    roomService.onRoomiMessage((message) => messages.push(message));

    const response = await endSession({ roomId: created.room.id, participantId: host.id });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(response.status).toBe(200);
    expect(snapshot.room.status).toBe('ended');
    expect(snapshot.currentSession?.summary).toBeTruthy();
    expect(snapshot.currentSession?.summary?.lumiComment).toBeTruthy();
    expect(messages.some((message) => message.kind === 'summary')).toBe(true);
  });

  it('returns 403 when a non-host tries to end the session', async () => {
    await startApp(new RoomiOrchestrator());
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    roomService.startSession(created.room.id, host.id);
    const joined = roomService.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;

    const response = await endSession({ roomId: created.room.id, participantId: member.id });

    expect(response.status).toBe(403);
  });

  it('includes a focus-time ranking sorted from most to least focused', async () => {
    // Only fake Date: the HTTP round trip below needs real timers/event loop to resolve.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    try {
      await startApp(new RoomiOrchestrator());
      const created = roomService.createRoom({ nickname: 'host' });
      const host = created.participants[0];
      const joined = roomService.joinRoom({
        nickname: 'member',
        inviteCode: created.room.inviteCode
      });
      const member = joined.participants.at(-1)!;
      roomService.startSession(created.room.id, host.id);

      vi.setSystemTime(new Date('2026-07-13T00:05:00.000Z'));
      roomService.updateParticipantStatus(created.room.id, member.id, 'focused');

      vi.setSystemTime(new Date('2026-07-13T00:10:00.000Z'));
      const response = await endSession({ roomId: created.room.id, participantId: host.id });
      const snapshot = (await response.json()) as RoomSnapshot;

      expect(snapshot.currentSession?.summary?.ranking).toEqual([
        { participantId: host.id, focusMinutes: 10 },
        { participantId: member.id, focusMinutes: 5 }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns 404 for an unknown room', async () => {
    await startApp(new RoomiOrchestrator());

    const response = await endSession({ roomId: 'missing', participantId: 'x' });

    expect(response.status).toBe(404);
  });
});

describe('POST /rooms/:roomId/goals/achieved', () => {
  let httpServer: HttpServer;
  let roomService: RoomService;
  let baseUrl: string;

  beforeEach(async () => {
    roomService = new RoomService(new InMemoryRoomStore());
    httpServer = createServer(createApp(roomService, new RoomiOrchestrator()));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function setAchieved(roomId: string, body: unknown) {
    return fetch(`${baseUrl}/rooms/${roomId}/goals/achieved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('marks a goal achieved and returns the snapshot', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    roomService.submitGoal(created.room.id, host.id, '수학 3단원');

    const response = await setAchieved(created.room.id, { participantId: host.id, achieved: true });
    const snapshot = (await response.json()) as RoomSnapshot;

    expect(response.status).toBe(200);
    expect(snapshot.goals[0]?.achieved).toBe(true);
  });

  it('returns 404 when the participant has no goal', async () => {
    const created = roomService.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const response = await setAchieved(created.room.id, { participantId: host.id, achieved: true });

    expect(response.status).toBe(404);
  });
});

describe('POST /goals/refine', () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  async function startApp(orchestrator: RoomiOrchestrator) {
    httpServer = createServer(createApp(new RoomService(new InMemoryRoomStore()), orchestrator));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
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
    expect(body.source).toBe('ollama');
    expect(body.refinedText).toBe('25분 집중: 수학 예제 3문제');
  });
});

describe('POST /focus/predict', () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function startApp(mlPredictor: MlFocusPredictor) {
    httpServer = createServer(
      createApp(new RoomService(new InMemoryRoomStore()), new RoomiOrchestrator(), mlPredictor)
    );
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  }

  function predict(body: unknown) {
    return fetch(`${baseUrl}/focus/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function feedback(body: unknown) {
    return fetch(`${baseUrl}/focus/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function resetFeedback(userId: string) {
    return fetch(`${baseUrl}/focus/feedback/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    });
  }

  it('forwards a feature window through the configured ML predictor', async () => {
    const featureWindow = { windowId: 'window-1', durationSec: 20 };
    const prediction = { modelVersion: 'ml-v1', label: 'focused', score: 0.9 };
    const received: unknown[] = [];
    const mlPredictor = {
      predict: async (input: unknown) => {
        received.push(input);
        return prediction;
      },
      submitFeedback: async () => ({ ok: true }),
      resetFeedback: async () => ({ ok: true })
    };

    await startApp(mlPredictor);
    const response = await predict(featureWindow);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(prediction);
    expect(received).toEqual([featureWindow]);
  });

  it.each([
    ['unavailable', 502],
    ['timeout', 504]
  ] as const)('maps an upstream %s failure to %s', async (kind, status) => {
    await startApp({
      predict: async () => {
        throw new MlFocusUpstreamError(`upstream ${kind}`, kind);
      },
      submitFeedback: async () => ({ ok: true }),
      resetFeedback: async () => ({ ok: true })
    });

    const response = await predict({ windowId: 'window-1' });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message: `upstream ${kind}` });
  });

  it('forwards user feedback through the configured ML predictor', async () => {
    const userFeedback = {
      windowId: 'window-1',
      predictedLabel: 'distracted',
      actualLabel: 'distracted',
      wasActuallyFocused: false
    };
    const received: unknown[] = [];
    const mlPredictor = {
      predict: async () => ({ label: 'focused' }),
      submitFeedback: async (input: unknown) => {
        received.push(input);
        return { ok: true };
      },
      resetFeedback: async () => ({ ok: true })
    };

    await startApp(mlPredictor);
    const response = await feedback(userFeedback);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(received).toEqual([userFeedback]);
  });

  it('forwards feedback resets through the configured ML predictor', async () => {
    const received: string[] = [];
    const mlPredictor = {
      predict: async () => ({ label: 'focused' }),
      submitFeedback: async () => ({ ok: true }),
      resetFeedback: async (userId: string) => {
        received.push(userId);
        return {
          userId,
          deletedFeedbackCount: 3,
          calibrationReset: true
        };
      }
    };

    await startApp(mlPredictor);
    const response = await resetFeedback('user/1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'user/1',
      deletedFeedbackCount: 3,
      calibrationReset: true
    });
    expect(received).toEqual(['user/1']);
  });
});

describe('LLM proxy routes', () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  async function startApp(llmProxy: LlmProxy) {
    httpServer = createServer(
      createApp(
        new RoomService(new InMemoryRoomStore()),
        new RoomiOrchestrator(),
        undefined,
        llmProxy
      )
    );
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  }

  it('forwards OpenAI-compatible chat completion requests through the configured LLM proxy', async () => {
    const received: unknown[] = [];
    await startApp({
      forward: async (input) => {
        received.push(input);
        return {
          status: 200,
          contentType: 'application/json',
          body: '{"choices":[{"message":{"content":"안녕!"}}]}'
        };
      }
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        messages: [{ role: 'user', content: '안녕' }]
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      choices: [{ message: { content: '안녕!' } }]
    });
    expect(received).toEqual([
      {
        method: 'POST',
        path: '/v1/chat/completions',
        body: {
          model: 'gemma3:4b',
          messages: [{ role: 'user', content: '안녕' }]
        }
      }
    ]);
  });

  it('forwards model list requests through the configured LLM proxy', async () => {
    const received: unknown[] = [];
    await startApp({
      forward: async (input) => {
        received.push(input);
        return {
          status: 200,
          contentType: 'application/json',
          body: '{"object":"list","data":[{"id":"gemma3:4b"}]}'
        };
      }
    });

    const response = await fetch(`${baseUrl}/v1/models`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      object: 'list',
      data: [{ id: 'gemma3:4b' }]
    });
    expect(received).toEqual([
      {
        method: 'GET',
        path: '/v1/models',
        body: undefined
      }
    ]);
  });

  it.each([
    ['unavailable', 502],
    ['timeout', 504]
  ] as const)('maps an LLM upstream %s failure to %s', async (kind, status) => {
    await startApp({
      forward: async () => {
        throw new LlmProxyUpstreamError(`llm ${kind}`, kind);
      }
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:4b', messages: [] })
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message: `llm ${kind}` });
  });
});

describe('CORS for packaged Electron', () => {
  let httpServer: HttpServer;
  let baseUrl: string;

  beforeEach(async () => {
    httpServer = createServer(
      createApp(new RoomService(new InMemoryRoomStore()), new RoomiOrchestrator())
    );
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it.each(['file://', 'null'])('allows the packaged renderer origin %s', async (origin) => {
    const response = await fetch(`${baseUrl}/focus/predict`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });
});
