import type {
  ChatMessage,
  ChatSendInput,
  FocusRankingBroadcast,
  RoomiMessage,
  RoomSnapshot,
  RoomSubscriptionInput,
  GoalSubmitInput,
  LeaveRoomInput,
  ParticipantReadyInput,
  UpdateParticipantStatusInput
} from './types';

export const realtimeEvents = {
  client: {
    leaveRoom: 'room:leave',
    subscribeRoom: 'room:subscribe',
    participantReady: 'participant:ready',
    submitGoal: 'goal:submit',
    updateStatus: 'participant:update-status',
    sendChatMessage: 'chat:send'
  },
  server: {
    roomSnapshot: 'room:snapshot',
    roomUpdated: 'room:updated',
    roomiMessage: 'roomi:message',
    chatMessage: 'chat:message',
    focusRankingUpdated: 'focus:ranking-updated',
    error: 'error'
  }
} as const;

export type ClientToServerEvents = {
  [realtimeEvents.client.leaveRoom]: (input: LeaveRoomInput) => void;
  [realtimeEvents.client.subscribeRoom]: (
    input: RoomSubscriptionInput,
    acknowledge: (snapshot: RoomSnapshot | undefined) => void
  ) => void;
  [realtimeEvents.client.participantReady]: (input: ParticipantReadyInput) => void;
  [realtimeEvents.client.submitGoal]: (input: GoalSubmitInput) => void;
  [realtimeEvents.client.updateStatus]: (
    input: UpdateParticipantStatusInput
  ) => void;
  [realtimeEvents.client.sendChatMessage]: (input: ChatSendInput) => void;
};

export type ServerToClientEvents = {
  [realtimeEvents.server.roomSnapshot]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomUpdated]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomiMessage]: (message: RoomiMessage) => void;
  [realtimeEvents.server.chatMessage]: (message: ChatMessage) => void;
  [realtimeEvents.server.focusRankingUpdated]: (payload: FocusRankingBroadcast) => void;
  [realtimeEvents.server.error]: (message: string) => void;
};
