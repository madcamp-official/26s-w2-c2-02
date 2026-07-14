import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VideoProvider } from '../video/daily-video-provider';
import { InMemoryRoomStore } from '../adapters/storage/in-memory-room-store';
import { RoomService } from './room-service';

function createService() {
  return new RoomService(new InMemoryRoomStore());
}

function createVideoProvider(): VideoProvider & {
  createRoom: ReturnType<typeof vi.fn<VideoProvider['createRoom']>>;
  createJoinInfo: ReturnType<typeof vi.fn<VideoProvider['createJoinInfo']>>;
  deleteRoom: ReturnType<typeof vi.fn<(dailyRoomName: string) => Promise<void>>>;
} {
  return {
    createRoom: vi.fn(async (roomId: string, _maxParticipants: number) => ({
      name: `daily-${roomId}`,
      roomUrl: `https://daily.example/${roomId}`
    })),
    createJoinInfo: vi.fn(async (input: Parameters<VideoProvider['createJoinInfo']>[0]) => ({
      name: input.dailyRoomName,
      roomUrl: input.roomUrl,
      token: `token-${input.userId}`
    })),
    deleteRoom: vi.fn(async (_dailyRoomName: string) => undefined)
  };
}

describe('RoomService participant readiness', () => {
  it('creates the host as not ready', () => {
    const service = createService();

    const snapshot = service.createRoom({ nickname: 'host' });

    expect(snapshot.participants[0]?.isReady).toBe(false);
  });

  it('creates a joining member as not ready', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    const joined = service.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });

    expect(joined.participants.at(-1)?.isReady).toBe(false);
  });

  it('marks a participant ready via setReady', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const updated = service.setReady(created.room.id, host.id, true);

    expect(updated.participants[0]?.isReady).toBe(true);
  });

  it('clears readiness when setReady is called with false', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.setReady(created.room.id, host.id, true);

    const updated = service.setReady(created.room.id, host.id, false);

    expect(updated.participants[0]?.isReady).toBe(false);
  });

  it('broadcasts a room update when readiness changes', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    let received: boolean | undefined;
    service.onRoomUpdated((snapshot) => {
      received = snapshot.participants[0]?.isReady;
    });

    service.setReady(created.room.id, host.id, true);

    expect(received).toBe(true);
  });

  it('throws when the room does not exist', () => {
    const service = createService();

    expect(() => service.setReady('missing-room', 'missing-participant', true)).toThrow(
      'Room not found'
    );
  });
});

describe('RoomService goals', () => {
  it('records a goal for a participant', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const snapshot = service.submitGoal(created.room.id, host.id, '수학 3단원');

    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]?.participantId).toBe(host.id);
    expect(snapshot.goals[0]?.rawText).toBe('수학 3단원');
  });

  it('upserts by participant: submitting twice keeps a single goal', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.submitGoal(created.room.id, host.id, '수학 3단원');

    const snapshot = service.submitGoal(created.room.id, host.id, '영어 단어 50개');

    expect(snapshot.goals).toHaveLength(1);
    expect(snapshot.goals[0]?.rawText).toBe('영어 단어 50개');
  });

  it('keeps one goal per participant', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const joined = service.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;

    service.submitGoal(created.room.id, host.id, '수학');
    const snapshot = service.submitGoal(created.room.id, member.id, '영어');

    expect(snapshot.goals).toHaveLength(2);
  });

  it('broadcasts a room update when a goal is submitted', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    let received: number | undefined;
    service.onRoomUpdated((snapshot) => {
      received = snapshot.goals.length;
    });

    service.submitGoal(created.room.id, host.id, '수학');

    expect(received).toBe(1);
  });

  it('allows submitting a goal while the room is already studying', () => {
    const store = new InMemoryRoomStore();
    const service = new RoomService(store);
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const stored = store.findByRoomId(created.room.id)!;
    stored.room.status = 'studying';
    store.update(stored);

    const snapshot = service.submitGoal(created.room.id, host.id, '늦게 합류한 목표');

    expect(snapshot.goals).toHaveLength(1);
  });

  it('throws when the participant is not in the room', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    expect(() => service.submitGoal(created.room.id, 'ghost', '목표')).toThrow(
      'Participant not found'
    );
  });

  it('throws when the room does not exist', () => {
    const service = createService();

    expect(() => service.submitGoal('missing-room', 'x', '목표')).toThrow('Room not found');
  });
});

describe('RoomService.startSession', () => {
  it('starts a study session when the host requests it', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const snapshot = service.startSession(created.room.id, host.id);

    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.currentSession?.mode).toBe('study');
    expect(snapshot.currentSession?.plannedMinutes).toBe(created.room.settings.sessionMinutes);
    expect(snapshot.currentSession?.startedAt).toBeTruthy();
    expect(snapshot.participants.find((participant) => participant.id === host.id)?.status).toBe(
      'focused'
    );
  });

  it('lets the host start even when other participants are not ready', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const joined = service.joinRoom({
      nickname: 'not-ready-member',
      inviteCode: created.room.inviteCode
    });

    expect(joined.participants.at(-1)?.isReady).toBe(false);

    const snapshot = service.startSession(created.room.id, host.id);

    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.participants.find((participant) => participant.id === host.id)?.status).toBe(
      'focused'
    );
    expect(snapshot.participants.find((participant) => participant.id !== host.id)?.status).toBe(
      'online'
    );
  });

  it('broadcasts a room update when the session starts', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    let received: string | undefined;
    service.onRoomUpdated((snapshot) => {
      received = snapshot.room.status;
    });

    service.startSession(created.room.id, host.id);

    expect(received).toBe('studying');
  });

  it('rejects a non-host participant', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const joined = service.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;

    expect(() => service.startSession(created.room.id, member.id)).toThrow('Only the host');
  });

  it('rejects starting when the room is not waiting', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    expect(() => service.startSession(created.room.id, host.id)).toThrow(
      'Session already started'
    );
  });

  it('restarts a fresh full-length session after a previous one ended', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    service.endSession(created.room.id, host.id);

    const snapshot = service.startSession(created.room.id, host.id);

    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.currentSession?.mode).toBe('study');
    expect(snapshot.currentSession?.endedAt).toBeUndefined();
    expect(snapshot.currentSession?.summary).toBeUndefined();
    expect(snapshot.currentSession?.plannedMinutes).toBe(created.room.settings.sessionMinutes);
  });

  it('throws when the room does not exist', () => {
    const service = createService();

    expect(() => service.startSession('missing-room', 'x')).toThrow('Room not found');
  });
});

describe('RoomService.endSession', () => {
  it('ends the session for the host and marks the room ended', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    const snapshot = service.endSession(created.room.id, host.id);

    expect(snapshot.room.status).toBe('ended');
    expect(snapshot.currentSession?.mode).toBe('ended');
    expect(snapshot.currentSession?.endedAt).toBeTruthy();
  });

  it('broadcasts a room update when the session ends', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    let received: string | undefined;
    service.onRoomUpdated((snapshot) => {
      received = snapshot.room.status;
    });

    service.endSession(created.room.id, host.id);

    expect(received).toBe('ended');
  });

  it('rejects a non-host participant', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    const joined = service.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;

    expect(() => service.endSession(created.room.id, member.id)).toThrow('Only the host');
  });

  it('rejects ending when there is no active session', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    expect(() => service.endSession(created.room.id, host.id)).toThrow(
      'No active session to end'
    );
  });

  it('throws when the room does not exist', () => {
    const service = createService();

    expect(() => service.endSession('missing-room', 'x')).toThrow('Room not found');
  });
});

describe('RoomService.attachSessionSummary', () => {
  it('attaches a summary to the current session', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    service.endSession(created.room.id, host.id);

    const snapshot = service.attachSessionSummary(created.room.id, {
      focusMinutes: 42,
      goalCompletionRate: 1
    });

    expect(snapshot.currentSession?.summary).toEqual({
      focusMinutes: 42,
      goalCompletionRate: 1
    });
  });

  it('throws when there is no session to attach a summary to', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    expect(() =>
      service.attachSessionSummary(created.room.id, { focusMinutes: 0, goalCompletionRate: 0 })
    ).toThrow('No session to attach a summary to');
  });
});

describe('RoomService.setGoalAchieved', () => {
  it('marks a goal achieved', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.submitGoal(created.room.id, host.id, '수학 3단원');

    const snapshot = service.setGoalAchieved(created.room.id, host.id, true);

    expect(snapshot.goals[0]?.achieved).toBe(true);
  });

  it('throws when the participant has no goal', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    expect(() => service.setGoalAchieved(created.room.id, host.id, true)).toThrow(
      'Goal not found'
    );
  });
});

describe('RoomService focus ranking', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ranks participants by accumulated focused time, keyed off status transitions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;

    // startSession seeds every participant's tracker: host is 'focused', member stays 'online'.
    service.startSession(created.room.id, host.id);

    vi.setSystemTime(new Date('2026-07-13T00:05:00.000Z'));
    service.updateParticipantStatus(created.room.id, member.id, 'focused');

    vi.setSystemTime(new Date('2026-07-13T00:08:00.000Z'));
    service.updateParticipantStatus(created.room.id, host.id, 'distracted');

    vi.setSystemTime(new Date('2026-07-13T00:15:00.000Z'));
    service.endSession(created.room.id, host.id);

    expect(service.getFocusRanking(created.room.id)).toEqual([
      { participantId: member.id, focusMinutes: 10 },
      { participantId: host.id, focusMinutes: 8 }
    ]);
  });

  it('lazily tracks a participant who joins and goes focused mid-session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    vi.setSystemTime(new Date('2026-07-13T00:04:00.000Z'));
    const joined = service.joinRoom({ nickname: 'latecomer', inviteCode: created.room.inviteCode });
    const latecomer = joined.participants.at(-1)!;
    service.updateParticipantStatus(created.room.id, latecomer.id, 'focused');

    vi.setSystemTime(new Date('2026-07-13T00:09:00.000Z'));
    service.endSession(created.room.id, host.id);

    const ranking = service.getFocusRanking(created.room.id);
    expect(ranking.find((entry) => entry.participantId === latecomer.id)?.focusMinutes).toBe(5);
  });

  it('returns an empty ranking for a room with no session history', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    expect(service.getFocusRanking(created.room.id)).toEqual([]);
  });
});

describe('RoomService.leaveRoom host delegation', () => {
  it('promotes the earliest remaining participant when the host leaves', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const originalHost = created.participants[0]!;
    const firstJoin = service.joinRoom({
      nickname: 'first',
      inviteCode: created.room.inviteCode
    });
    const firstMember = firstJoin.participants.at(-1)!;
    service.joinRoom({
      nickname: 'second',
      inviteCode: created.room.inviteCode
    });

    const snapshot = service.leaveRoom(created.room.id, originalHost.id);

    expect(snapshot.room.hostUserId).toBe(firstMember.userId);
    expect(snapshot.participants.find((participant) => participant.id === firstMember.id)?.role).toBe(
      'host'
    );
    expect(snapshot.participants.filter((participant) => participant.role === 'host')).toHaveLength(1);
  });

  it('broadcasts the delegated host after the host leaves', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const originalHost = created.participants[0]!;
    const joined = service.joinRoom({
      nickname: 'member',
      inviteCode: created.room.inviteCode
    });
    const member = joined.participants.at(-1)!;
    let delegatedHostId: string | undefined;
    service.onRoomUpdated((snapshot) => {
      delegatedHostId = snapshot.participants.find((participant) => participant.role === 'host')?.id;
    });

    service.leaveRoom(created.room.id, originalHost.id);

    expect(delegatedHostId).toBe(member.id);
  });

  it('deletes the Daily room when the last participant leaves', async () => {
    const videoProvider = createVideoProvider();
    const service = new RoomService(new InMemoryRoomStore(), videoProvider);
    const session = await service.createRoomSession({ nickname: 'host' });

    service.leaveRoom(session.snapshot.room.id, session.currentParticipantId);
    await vi.waitFor(() => expect(videoProvider.deleteRoom).toHaveBeenCalledTimes(1));

    expect(videoProvider.deleteRoom).toHaveBeenCalledWith(`daily-${session.snapshot.room.id}`);
  });
});

describe('RoomService Daily session rollback', () => {
  it('does not return a local-only room when Daily room creation fails', async () => {
    const videoProvider = createVideoProvider();
    videoProvider.createRoom.mockRejectedValueOnce(new Error('Daily room creation failed: 500'));
    const service = new RoomService(new InMemoryRoomStore(), videoProvider);

    await expect(service.createRoomSession({ nickname: 'host' })).rejects.toThrow(
      'Daily room creation failed'
    );
  });

  it('removes a joining participant when Daily token creation fails', async () => {
    const videoProvider = createVideoProvider();
    const service = new RoomService(new InMemoryRoomStore(), videoProvider);
    const hostSession = await service.createRoomSession({ nickname: 'host' });
    videoProvider.createJoinInfo.mockRejectedValueOnce(new Error('Daily token creation failed: 500'));

    await expect(
      service.joinRoomSession({
        nickname: 'member',
        inviteCode: hostSession.snapshot.room.inviteCode
      })
    ).rejects.toThrow('Daily token creation failed');
    expect(service.getByRoomId(hostSession.snapshot.room.id)?.participants).toHaveLength(1);
  });
});

describe('RoomService Roomi messages', () => {
  it('stores a personal message and emits it to realtime listeners', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0]!;
    let receivedText: string | undefined;
    service.onRoomiMessage((message) => {
      receivedText = message.text;
    });

    const message = service.addRoomiMessage({
      roomId: created.room.id,
      kind: 'focus_recovery',
      text: '다음 한 단계부터 다시 시작해보자.',
      targetParticipantId: host.id
    });

    expect(message.id).toBeTruthy();
    expect(receivedText).toBe(message.text);
    expect(service.getByRoomId(created.room.id)?.roomiMessages).toEqual([message]);
  });

  it('does not include another participant’s personal message in a snapshot', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0]!;
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;
    service.addRoomiMessage({
      roomId: created.room.id,
      kind: 'focus_recovery',
      text: 'member only',
      targetParticipantId: member.id
    });

    expect(service.snapshotForParticipant(created.room.id, host.id).roomiMessages).toEqual([]);
    expect(service.snapshotForParticipant(created.room.id, member.id).roomiMessages).toHaveLength(1);
  });
});
