import type {
  JoinRoomInput,
  RoomSnapshot,
  UpdateParticipantStatusInput
} from './types';

export const realtimeEvents = {
  client: {
    joinRoom: 'room:join',
    leaveRoom: 'room:leave',
    subscribeRoom: 'room:subscribe',
    updateStatus: 'participant:update-status'
  },
  server: {
    roomSnapshot: 'room:snapshot',
    roomUpdated: 'room:updated',
    roomiMessage: 'roomi:message',
    error: 'error'
  }
} as const;

export type ClientToServerEvents = {
  [realtimeEvents.client.joinRoom]: (
    input: JoinRoomInput,
    acknowledge: (snapshot: RoomSnapshot) => void
  ) => void;
  [realtimeEvents.client.leaveRoom]: (roomId: string) => void;
  [realtimeEvents.client.subscribeRoom]: (
    roomId: string,
    acknowledge: (snapshot: RoomSnapshot | undefined) => void
  ) => void;
  [realtimeEvents.client.updateStatus]: (
    input: UpdateParticipantStatusInput
  ) => void;
};

export type ServerToClientEvents = {
  [realtimeEvents.server.roomSnapshot]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomUpdated]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomiMessage]: (message: string) => void;
  [realtimeEvents.server.error]: (message: string) => void;
};
