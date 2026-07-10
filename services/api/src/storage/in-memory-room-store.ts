import type { Goal, LumiMessage, Participant, Room, RoomSnapshot } from '@lumi/shared';

type StoredRoom = {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  lumiMessages: LumiMessage[];
};

export class InMemoryRoomStore {
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
