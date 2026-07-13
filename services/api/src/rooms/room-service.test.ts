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
});
