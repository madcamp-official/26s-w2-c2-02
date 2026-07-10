import type {
  JoinRoomInput,
  RoomSnapshot,
  UpdateParticipantStatusInput
} from './types';

export const realtimeEvents = {
  client: {
    joinRoom: 'room:join',
    leaveRoom: 'room:leave',
    updateStatus: 'participant:update-status'
  },
  server: {
    roomSnapshot: 'room:snapshot',
    roomUpdated: 'room:updated',
    lumiMessage: 'lumi:message',
    error: 'error'
  }
} as const;

export type ClientToServerEvents = {
  [realtimeEvents.client.joinRoom]: (
    input: JoinRoomInput,
    acknowledge: (snapshot: RoomSnapshot) => void
  ) => void;
  [realtimeEvents.client.leaveRoom]: (roomId: string) => void;
  [realtimeEvents.client.updateStatus]: (
    input: UpdateParticipantStatusInput
  ) => void;
};

export type ServerToClientEvents = {
  [realtimeEvents.server.roomSnapshot]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomUpdated]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.lumiMessage]: (message: string) => void;
  [realtimeEvents.server.error]: (message: string) => void;
};
