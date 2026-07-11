import type { RoomSnapshot } from '@roomi/shared';

export type RoomStore = {
  saveRoom(snapshot: RoomSnapshot): void;
  findByRoomId(roomId: string): RoomSnapshot | undefined;
  findByInviteCode(inviteCode: string): RoomSnapshot | undefined;
  update(snapshot: RoomSnapshot): void;
};
