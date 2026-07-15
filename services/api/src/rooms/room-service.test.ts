import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VideoProvider } from '../video/daily-video-provider';
import { InMemoryRoomStore } from '../adapters/storage/in-memory-room-store';
import { hiddenMissionTemplates, RoomService } from './room-service';

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

describe('RoomService.startBreak', () => {
  it('starts a room-wide break and sets breakEndsAt from breakMinutes', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    const before = Date.now();
    const snapshot = service.startBreak(created.room.id, host.id);
    const after = Date.now();

    expect(snapshot.room.status).toBe('break');
    expect(snapshot.currentSession?.mode).toBe('break');
    expect(snapshot.participants.every((participant) => participant.status === 'break')).toBe(true);
    const breakEndsAt = Date.parse(snapshot.currentSession!.breakEndsAt!);
    const breakMs = created.room.settings.breakMinutes * 60_000;
    expect(breakEndsAt).toBeGreaterThanOrEqual(before + breakMs);
    expect(breakEndsAt).toBeLessThanOrEqual(after + breakMs);
  });

  it('rejects a non-host participant', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    service.startSession(created.room.id, created.participants[0].id);
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;

    expect(() => service.startBreak(created.room.id, member.id)).toThrow('Only the host');
  });

  it('rejects starting a break when breakMode is individual', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { breakMode: 'individual' }
    });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    expect(() => service.startBreak(created.room.id, host.id)).toThrow(
      'Break mode is not room-wide'
    );
  });

  it('rejects starting a break in game mode rooms', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { activityKind: 'poker_bluff', defaultGameKind: 'poker_bluff' }
    });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    expect(() => service.startBreak(created.room.id, host.id)).toThrow(
      'Breaks are only available in study mode'
    );
  });

  it('rejects starting a break with no active study session', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    expect(() => service.startBreak(created.room.id, created.participants[0].id)).toThrow(
      'No active study session to pause'
    );
  });
});

describe('RoomService.endBreak', () => {
  it('returns the room to studying and resets participants to focused', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    service.startBreak(created.room.id, host.id);

    const snapshot = service.endBreak(created.room.id, host.id);

    expect(snapshot.room.status).toBe('studying');
    expect(snapshot.currentSession?.mode).toBe('study');
    expect(snapshot.currentSession?.breakEndsAt).toBeUndefined();
    expect(snapshot.participants.every((participant) => participant.status === 'focused')).toBe(
      true
    );
  });

  it('rejects ending a break when there is none active', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    service.startSession(created.room.id, created.participants[0].id);

    expect(() => service.endBreak(created.room.id, created.participants[0].id)).toThrow(
      'No active break to end'
    );
  });
});

describe('RoomService.extendBreak', () => {
  it('pushes breakEndsAt out by the given minutes', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);
    const started = service.startBreak(created.room.id, host.id);
    const originalEndsAt = Date.parse(started.currentSession!.breakEndsAt!);

    const extended = service.extendBreak(created.room.id, host.id, 5);

    expect(Date.parse(extended.currentSession!.breakEndsAt!)).toBe(originalEndsAt + 5 * 60_000);
  });

  it('rejects extending when there is no active break', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    service.startSession(created.room.id, created.participants[0].id);

    expect(() => service.extendBreak(created.room.id, created.participants[0].id, 5)).toThrow(
      'No active break to extend'
    );
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

describe('RoomService face party games', () => {
  it('keeps hidden mission templates curated', () => {
    expect(hiddenMissionTemplates).toHaveLength(14);
    expect(hiddenMissionTemplates.map((mission) => mission.verify)).not.toContain(
      'cheek_puff_count'
    );
    expect(hiddenMissionTemplates.map((mission) => mission.verify)).not.toContain(
      'no_jaw_open'
    );
    expect(hiddenMissionTemplates.map((mission) => mission.verify)).toEqual(
      expect.arrayContaining(['jaw_open_count', 'nod_count'])
    );
    expect(hiddenMissionTemplates.map((mission) => mission.prompt)).not.toContain(
      '생각하는 척하며 볼을 3번 부풀리기'
    );
  });

  it('starts hidden mission with private missions and server-owned scores', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0]!;
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;
    const assigned: string[] = [];
    service.onMissionAssigned((_roomId, mission) => assigned.push(mission.playerId));

    const game = service.startGame(created.room.id, host.id, 'hidden_mission');

    expect(game.kind).toBe('hidden_mission');
    expect(game.status).toBe('in_round');
    expect(game.missions).toHaveLength(2);
    expect(game.missions?.map((mission) => mission.playerId).sort()).toEqual(
      [host.id, member.id].sort()
    );
    expect(game.scores).toEqual([
      { participantId: host.id, points: 0 },
      { participantId: member.id, points: 0 }
    ]);
    expect(assigned.sort()).toEqual([host.id, member.id].sort());
  });

  it('assigns varied hidden mission prompts in a round', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    service.joinRoom({ nickname: 'member-1', inviteCode: created.room.inviteCode });
    service.joinRoom({ nickname: 'member-2', inviteCode: created.room.inviteCode });
    service.joinRoom({ nickname: 'member-3', inviteCode: created.room.inviteCode });
    const host = created.participants[0]!;

    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const prompts = new Set(game.missions?.map((mission) => mission.prompt));

    expect(game.missions).toHaveLength(4);
    expect(prompts.size).toBeGreaterThan(1);
    expect(game.missions?.every((mission) => mission.prompt.length > 0)).toBe(true);
  });

  it('records mission result and awards points on reveal', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0]!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const mission = game.missions![0]!;

    service.recordMissionResult(created.room.id, {
      playerId: host.id,
      missionId: mission.id,
      count: mission.target,
      success: true
    });
    const revealed = service.revealGame(created.room.id, host.id, game.id);

    expect(revealed.status).toBe('reveal');
    expect(revealed.scores.find((score) => score.participantId === host.id)?.points).toBe(10);
  });

  it('uses room round count and waits between rounds after a mission success', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { activityKind: 'hidden_mission', roundCount: 3 }
    });
    const host = created.participants[0]!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const mission = game.missions![0]!;

    const waiting = service.recordMissionResult(created.room.id, {
      playerId: host.id,
      missionId: mission.id,
      count: mission.target,
      success: true
    });

    expect(waiting.totalRounds).toBe(3);
    expect(waiting.status).toBe('between_round');
    expect(waiting.completedRounds).toHaveLength(1);
    expect(waiting.scores.find((score) => score.participantId === host.id)?.points).toBe(10);
    expect(waiting.nextRoundStartsAt).toBeTruthy();
  });

  it('starts the next round when all active participants are ready', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { activityKind: 'hidden_mission', roundCount: 2 }
    });
    const host = created.participants[0]!;
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const mission = game.missions!.find((item) => item.playerId === host.id)!;
    const waiting = service.recordMissionResult(created.room.id, {
      playerId: host.id,
      missionId: mission.id,
      count: mission.target,
      success: true
    });

    service.markNextRoundReady(created.room.id, host.id, waiting.id);
    const nextRound = service.markNextRoundReady(created.room.id, member.id, waiting.id);

    expect(nextRound.status).toBe('in_round');
    expect(nextRound.round.index).toBe(2);
    expect(nextRound.missionResults).toEqual([]);
    expect(nextRound.nextRoundReadyParticipantIds).toEqual([]);
    const nextMission = nextRound.missions!.find((item) => item.playerId === host.id)!;
    expect(nextMission.id).not.toBe(mission.id);
    expect(nextMission.prompt).not.toBe(mission.prompt);
  });

  it('awards partial hidden mission points by progress ratio', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { activityKind: 'hidden_mission', roundCount: 2 }
    });
    const host = created.participants[0]!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const mission = game.missions!.find((item) => item.playerId === host.id)!;
    const progressCount = Math.max(1, Math.floor(mission.target / 2));

    service.recordMissionResult(created.room.id, {
      playerId: host.id,
      missionId: mission.id,
      count: progressCount,
      success: false
    });
    const revealed = service.revealGame(created.room.id, host.id, game.id);
    const expectedPoints = Math.round((progressCount / mission.target) * 10);

    expect(revealed.scores.find((score) => score.participantId === host.id)?.points).toBe(
      expectedPoints
    );
  });

  it('replaces a hidden mission when a player returns from the waiting room', () => {
    const service = createService();
    const created = service.createRoom({
      nickname: 'host',
      settings: { activityKind: 'hidden_mission' }
    });
    const host = created.participants[0]!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');
    const previousMission = game.missions!.find((mission) => mission.playerId === host.id)!;

    service.updateParticipantStatus(created.room.id, host.id, 'online');
    const snapshot = service.updateParticipantStatus(created.room.id, host.id, 'focused');
    const replacement = snapshot.currentGame?.missions?.find(
      (mission) => mission.playerId === host.id
    );

    expect(replacement?.id).not.toBe(previousMission.id);
    expect(replacement?.prompt).not.toBe(previousMission.prompt);
  });

  it('rejects non-host game start', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;

    expect(() => service.startGame(created.room.id, member.id, 'hidden_mission')).toThrow(
      'Only the host can start the game'
    );
  });

  it('rejects non-host game reveal', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const host = created.participants[0]!;
    const member = joined.participants.at(-1)!;
    const game = service.startGame(created.room.id, host.id, 'hidden_mission');

    expect(() => service.revealGame(created.room.id, member.id, game.id)).toThrow(
      'Only the host can reveal the game'
    );
  });
});

describe('RoomService focus ranking', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ranks participants by focus score, keyed off status transitions', () => {
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
      // 10 focused minutes: 600s / 5 * 10.
      { participantId: member.id, focusMinutes: 10, score: 1_200, nickname: 'member', left: false },
      // 8 focused minutes earns 960, then 7 distracted minutes drains 420 of it.
      { participantId: host.id, focusMinutes: 8, score: 540, nickname: 'host', left: false }
    ]);
  });

  it('freezes focus time at the moment a participant leaves and keeps them ranked', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;

    service.startSession(created.room.id, host.id);
    service.updateParticipantStatus(created.room.id, member.id, 'focused');

    vi.setSystemTime(new Date('2026-07-13T00:05:00.000Z'));
    service.leaveRoom(created.room.id, member.id);

    // Time that passes after leaving must not count toward focus, even though
    // the tracker entry is kept around for the final ranking.
    vi.setSystemTime(new Date('2026-07-13T00:15:00.000Z'));
    service.endSession(created.room.id, host.id);

    const ranking = service.getFocusRanking(created.room.id);
    expect(ranking.find((entry) => entry.participantId === member.id)).toEqual({
      participantId: member.id,
      focusMinutes: 5,
      score: 600,
      nickname: 'member',
      left: true
    });
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

  it('keeps ticking while a participant simply stays focused', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    service.startSession(created.room.id, created.participants[0].id);

    // No status change fires while someone keeps working, so the ranking has to
    // project the time since the last one or the heartbeat rebroadcasts a frozen
    // value for the whole session.
    vi.setSystemTime(new Date('2026-07-13T00:10:00.000Z'));
    const live = service.getFocusRanking(created.room.id);

    expect(live[0]?.focusMinutes).toBe(10);
    expect(live[0]?.score).toBe(1_200);
  });

  it('drains the score while a participant is away and floors it at 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    // One focused minute banks 120, then two away minutes would take it to -360.
    vi.setSystemTime(new Date('2026-07-13T00:01:00.000Z'));
    service.updateParticipantStatus(created.room.id, host.id, 'away');

    vi.setSystemTime(new Date('2026-07-13T00:03:00.000Z'));
    expect(service.getFocusRanking(created.room.id)[0]?.score).toBe(0);
  });

  it('starts earning again immediately after the score bottoms out', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    vi.setSystemTime(new Date('2026-07-13T00:00:30.000Z'));
    service.updateParticipantStatus(created.room.id, host.id, 'away');

    // Long enough away that an unclamped score would be deep underwater.
    vi.setSystemTime(new Date('2026-07-13T00:30:00.000Z'));
    service.updateParticipantStatus(created.room.id, host.id, 'focused');

    // Coming back must pay out from 0 rather than climb out of a hole.
    vi.setSystemTime(new Date('2026-07-13T00:31:00.000Z'));
    expect(service.getFocusRanking(created.room.id)[0]?.score).toBe(120);
  });

  it('holds the score still during an agreed break', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    vi.setSystemTime(new Date('2026-07-13T00:01:00.000Z'));
    service.startBreak(created.room.id, host.id);

    vi.setSystemTime(new Date('2026-07-13T00:11:00.000Z'));
    expect(service.getFocusRanking(created.room.id)[0]?.score).toBe(120);
  });

  it('returns an empty ranking for a room with no session history', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });

    expect(service.getFocusRanking(created.room.id)).toEqual([]);
  });
});

describe('RoomService live focus ranking broadcast', () => {
  it('notifies listeners with the current ranking when a status changes mid-session', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    const payloads: Array<{ roomId: string; ranking: unknown[] }> = [];
    service.onFocusRankingUpdated((payload) => payloads.push(payload));

    service.updateParticipantStatus(created.room.id, host.id, 'distracted');

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.roomId).toBe(created.room.id);
    expect(payloads[0]?.ranking).toEqual(service.getFocusRanking(created.room.id));
  });

  it('does not broadcast a ranking update before the session has started', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];

    const payloads: unknown[] = [];
    service.onFocusRankingUpdated((payload) => payloads.push(payload));

    service.updateParticipantStatus(created.room.id, host.id, 'online');

    expect(payloads).toHaveLength(0);
  });

  it('notifies listeners with the frozen ranking when a participant leaves mid-session', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    const joined = service.joinRoom({ nickname: 'member', inviteCode: created.room.inviteCode });
    const member = joined.participants.at(-1)!;
    service.startSession(created.room.id, host.id);

    const payloads: Array<{ roomId: string; ranking: unknown[] }> = [];
    service.onFocusRankingUpdated((payload) => payloads.push(payload));

    service.leaveRoom(created.room.id, member.id);

    expect(payloads).toHaveLength(1);
    expect(
      (payloads[0]?.ranking as Array<{ participantId: string; left: boolean }>).find(
        (entry) => entry.participantId === member.id
      )?.left
    ).toBe(true);
  });

  it('stops notifying an unsubscribed listener', () => {
    const service = createService();
    const created = service.createRoom({ nickname: 'host' });
    const host = created.participants[0];
    service.startSession(created.room.id, host.id);

    const payloads: unknown[] = [];
    const unsubscribe = service.onFocusRankingUpdated((payload) => payloads.push(payload));
    unsubscribe();

    service.updateParticipantStatus(created.room.id, host.id, 'distracted');

    expect(payloads).toHaveLength(0);
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
