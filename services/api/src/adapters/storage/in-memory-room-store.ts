import type { Goal, RoomiMessage, Participant, Room, RoomSnapshot } from '@roomi/shared';
import type { RoomStore } from '../../rooms/room-store';

type StoredRoom = {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
};

export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, StoredRoom>();

  saveRoom(snapshot: RoomSnapshot) {
    this.rooms.set(snapshot.room.id, snapshot);
  }

  findByRoomId(roomId: string): RoomSnapshot | undefined {
    return this.clone(this.rooms.get(roomId));
  }

  findByInviteCode(inviteCode: string): RoomSnapshot | undefined {
    for (const stored of this.rooms.values()) {
      if (stored.room.inviteCode === inviteCode) {
        return this.clone(stored);
      }
    }

    return undefined;
  }

  update(snapshot: RoomSnapshot) {
    this.rooms.set(snapshot.room.id, snapshot);
  }

  private clone(snapshot: StoredRoom | undefined): RoomSnapshot | undefined {
    if (!snapshot) {
      return undefined;
    }

    return structuredClone(snapshot);
  }
}
