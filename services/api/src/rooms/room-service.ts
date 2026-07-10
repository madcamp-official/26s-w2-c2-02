import type {
  CreateRoomInput,
  JoinRoomInput,
  Participant,
  ParticipantStatus,
  Room,
  RoomSettings,
  RoomSnapshot
} from '@lumi/shared';
import { defaultRoomSettings } from './default-settings';
import type { InMemoryRoomStore } from '../storage/in-memory-room-store';

export class RoomService {
  constructor(private readonly store: InMemoryRoomStore) {}

  createRoom(input: CreateRoomInput): RoomSnapshot {
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const roomId = crypto.randomUUID();
    const settings = this.mergeSettings(input.settings);
    const room: Room = {
      id: roomId,
      inviteCode: this.createInviteCode(),
      hostUserId: userId,
      settings,
      status: 'waiting',
      createdAt: now
    };
    const host = this.createParticipant({
      roomId,
      userId,
      nickname: input.nickname,
      role: 'host',
      scoreVisible: settings.defaultScoreVisibility === 'public',
      now
    });
    const snapshot: RoomSnapshot = {
      room,
      participants: [host],
      goals: [],
      lumiMessages: []
    };

    this.store.saveRoom(snapshot);
    return snapshot;
  }

  joinRoom(input: JoinRoomInput): RoomSnapshot {
    const snapshot = this.store.findByInviteCode(input.inviteCode);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    if (snapshot.participants.length >= snapshot.room.settings.maxParticipants) {
      throw new Error('Room is full');
    }

    const now = new Date().toISOString();
    const participant = this.createParticipant({
      roomId: snapshot.room.id,
      userId: crypto.randomUUID(),
      nickname: input.nickname,
      role: 'member',
      scoreVisible: snapshot.room.settings.defaultScoreVisibility === 'public',
      now
    });

    snapshot.participants.push(participant);
    this.store.update(snapshot);
    return snapshot;
  }

  updateParticipantStatus(
    roomId: string,
    participantId: string,
    status: ParticipantStatus
  ): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    snapshot.participants = snapshot.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, status, lastSeenAt: new Date().toISOString() }
        : participant
    );
    this.store.update(snapshot);
    return snapshot;
  }

  getByInviteCode(inviteCode: string): RoomSnapshot | undefined {
    return this.store.findByInviteCode(inviteCode);
  }

  private mergeSettings(settings: Partial<RoomSettings> | undefined): RoomSettings {
    return {
      ...defaultRoomSettings,
      ...settings,
      maxParticipants: 4,
      authMode: 'nickname_code',
      videoProvider: 'daily',
      lumiTone: 'friendly_casual',
      rankingMetric: 'focus_minutes'
    };
  }

  private createParticipant(input: {
    roomId: string;
    userId: string;
    nickname: string;
    role: Participant['role'];
    scoreVisible: boolean;
    now: string;
  }): Participant {
    return {
      id: crypto.randomUUID(),
      roomId: input.roomId,
      userId: input.userId,
      nickname: input.nickname,
      role: input.role,
      status: 'online',
      scoreVisible: input.scoreVisible,
      joinedAt: input.now,
      lastSeenAt: input.now
    };
  }

  private createInviteCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}
