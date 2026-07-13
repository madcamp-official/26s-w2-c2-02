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
