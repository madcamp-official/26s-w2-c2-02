import { describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from '../adapters/storage/in-memory-room-store';
import { RoomService } from './room-service';

function createService() {
  return new RoomService(new InMemoryRoomStore());
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

  it('throws when the room does not exist', () => {
    const service = createService();

    expect(() => service.startSession('missing-room', 'x')).toThrow('Room not found');
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
