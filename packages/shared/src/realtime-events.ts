import type {
  RoomiMessage,
  ChatMessage,
  ChatSendInput,
  FocusRankingBroadcast,
  RoomSnapshot,
  RoomSubscriptionInput,
  GoalSubmitInput,
  LeaveRoomInput,
  ParticipantReadyInput,
  UpdateParticipantStatusInput,
  GameStartInput,
  ExpressionReportInput,
  BluffBetInput,
  RelayAdvanceInput,
  GameRevealInput,
  GameNextRoundReadyInput,
  GameSession,
  HiddenMission,
  MissionResult
} from './types';

export const realtimeEvents = {
  client: {
    leaveRoom: 'room:leave',
    subscribeRoom: 'room:subscribe',
    participantReady: 'participant:ready',
    submitGoal: 'goal:submit',
    updateStatus: 'participant:update-status',
    startGame: 'game:start',
    reportExpression: 'expression:report',
    placeBluffBet: 'bluff:bet',
    advanceRelay: 'relay:advance',
    revealGame: 'game:reveal',
    nextRoundReady: 'game:next-round-ready',
    sendChatMessage: 'chat:send'
  },
  server: {
    roomSnapshot: 'room:snapshot',
    roomUpdated: 'room:updated',
    roomiMessage: 'roomi:message',
    gameRoundBegin: 'game:round-begin',
    missionAssign: 'mission:assign',
    missionResult: 'mission:result',
    gameReveal: 'game:reveal',
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
  [realtimeEvents.client.startGame]: (input: GameStartInput) => void;
  [realtimeEvents.client.reportExpression]: (input: ExpressionReportInput) => void;
  [realtimeEvents.client.placeBluffBet]: (input: BluffBetInput) => void;
  [realtimeEvents.client.advanceRelay]: (input: RelayAdvanceInput) => void;
  [realtimeEvents.client.revealGame]: (input: GameRevealInput) => void;
  [realtimeEvents.client.nextRoundReady]: (input: GameNextRoundReadyInput) => void;
  [realtimeEvents.client.sendChatMessage]: (input: ChatSendInput) => void;
};

export type ServerToClientEvents = {
  [realtimeEvents.server.roomSnapshot]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomUpdated]: (snapshot: RoomSnapshot) => void;
  [realtimeEvents.server.roomiMessage]: (message: RoomiMessage) => void;
  [realtimeEvents.server.gameRoundBegin]: (game: GameSession) => void;
  [realtimeEvents.server.missionAssign]: (mission: HiddenMission) => void;
  [realtimeEvents.server.missionResult]: (result: MissionResult) => void;
  [realtimeEvents.server.gameReveal]: (game: GameSession) => void;
  [realtimeEvents.server.chatMessage]: (message: ChatMessage) => void;
  [realtimeEvents.server.focusRankingUpdated]: (payload: FocusRankingBroadcast) => void;
  [realtimeEvents.server.error]: (message: string) => void;
};
