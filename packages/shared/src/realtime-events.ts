import type {
  RoomSnapshot,
  LeaveRoomInput,
  ParticipantReadyInput,
  UpdateParticipantStatusInput
} from './types';

export const realtimeEvents = {
  client: {
    leaveRoom: 'room:leave',
    subscribeRoom: 'room:subscribe',
    participantReady: 'participant:ready',
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
  [realtimeEvents.client.leaveRoom]: (input: LeaveRoomInput) => void;
  [realtimeEvents.client.subscribeRoom]: (
    roomId: string,
    acknowledge: (snapshot: RoomSnapshot | undefined) => void
  ) => void;
  [realtimeEvents.client.participantReady]: (input: ParticipantReadyInput) => void;
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
