export type ISODateString = string;

export type RoomStatus = 'waiting' | 'studying' | 'break' | 'ended';

export type GameKind = 'hidden_mission' | 'poker_bluff' | 'copycat_relay';

export type RoomActivityKind = 'study' | GameKind;

export type GameStatus = 'lobby' | 'in_round' | 'guessing' | 'reveal' | 'ended';

export type ParticipantStatus =
  | 'online'
  | 'focused'
  | 'distracted'
  | 'away'
  | 'break'
  | 'paused';

export type User = {
  id: string;
  nickname: string;
  createdAt: ISODateString;
};

export type RoomSettings = {
  activityKind: RoomActivityKind;
  defaultGameKind: GameKind;
  sessionMinutes: number;
  breakMode: 'room' | 'individual';
  breakMinutes: number;
  defaultScoreVisibility: 'public' | 'private';
  maxParticipants: 4;
  authMode: 'nickname_code';
  videoProvider: 'daily';
  roomiTone: 'friendly_casual';
  rankingMetric: 'focus_minutes';
  videoRequired: boolean;
  detectionPauseAllowed: boolean;
};

export type Room = {
  id: string;
  inviteCode: string;
  hostUserId: string;
  settings: RoomSettings;
  status: RoomStatus;
  createdAt: ISODateString;
};

export type Participant = {
  id: string;
  roomId: string;
  userId: string;
  nickname: string;
  role: 'host' | 'member';
  status: ParticipantStatus;
  isReady: boolean;
  scoreVisible: boolean;
  joinedAt: ISODateString;
  lastSeenAt: ISODateString;
};

export type Goal = {
  id: string;
  roomId: string;
  participantId: string;
  rawText: string;
  refinedText?: string;
  achieved?: boolean;
  createdAt: ISODateString;
};

export type RoomiMessage = {
  id: string;
  roomId: string;
  kind:
    | 'goal_refine'
    | 'start'
    | 'focus_recovery'
    | 'break_return'
    | 'summary'
    | 'game_intro'
    | 'round_prompt'
    | 'tell_hint'
    | 'game_reveal'
    | 'game_summary';
  text: string;
  targetParticipantId?: string;
  createdAt: ISODateString;
};

export type ExpressionSignals = {
  timestamp: number;
  smile: number;
  jawOpen: number;
  winkLeft: boolean;
  winkRight: boolean;
  browRaise: number;
  cheekPuff: number;
  mouthPucker: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
};

export type HiddenMissionVerify =
  | 'wink_count'
  | 'smile_count'
  | 'no_jaw_open'
  | 'brow_count'
  | 'cheek_puff_count';

export type HiddenMission = {
  id: string;
  playerId: string;
  prompt: string;
  verify: HiddenMissionVerify;
  target: number;
};

export type MissionResult = {
  playerId: string;
  missionId: string;
  count: number;
  success: boolean;
};

export type BluffTell = 'smile' | 'jaw' | 'brow' | null;

export type BluffBet = {
  participantId: string;
  targetId: string;
  predictsCrack: boolean;
};

export type BluffResult = {
  targetId: string;
  cracked: boolean;
  tell: BluffTell;
  heldMs: number;
};

export type RelayLink = {
  fromId: string;
  toId: string;
  similarity: number;
};

export type GameRound = {
  id: string;
  gameId: string;
  index: number;
  status: GameStatus;
  startedAt?: ISODateString;
  endsAt?: ISODateString;
  revealAt?: ISODateString;
};

export type GameScore = {
  participantId: string;
  points: number;
};

export type GameSession = {
  id: string;
  roomId: string;
  kind: GameKind;
  status: GameStatus;
  round: GameRound;
  scores: GameScore[];
  missions?: HiddenMission[];
  missionResults?: MissionResult[];
  bluffBets?: BluffBet[];
  bluffResult?: BluffResult;
  relayLinks?: RelayLink[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type FocusRankingEntry = {
  participantId: string;
  focusMinutes: number;
};

export type SessionSummary = {
  focusMinutes: number;
  goalCompletionRate: number;
  goalFeedback?: string;
  lumiComment?: string;
  ranking?: FocusRankingEntry[];
};

export type StudySession = {
  id: string;
  roomId: string;
  startedAt: ISODateString;
  endedAt?: ISODateString;
  plannedMinutes: number;
  mode: 'study' | 'break' | 'ended';
  breakEndsAt?: ISODateString;
  summary?: SessionSummary;
};

export type RoomSnapshot = {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  currentSession?: StudySession;
  currentGame?: GameSession;
};

export type RoomSession = {
  snapshot: RoomSnapshot;
  currentParticipantId: string;
  videoJoin?: VideoJoinInfo;
};

export type VideoJoinInfo = {
  provider: 'daily';
  roomUrl: string;
  token: string;
};

export type CreateRoomInput = {
  nickname: string;
  settings?: Partial<RoomSettings>;
};

export type JoinRoomInput = {
  nickname: string;
  inviteCode: string;
};

export type LeaveRoomInput = {
  roomId: string;
  participantId: string;
};

export type RoomSubscriptionInput = {
  roomId: string;
  participantId: string;
};

export type UpdateParticipantStatusInput = {
  roomId: string;
  participantId: string;
  status: ParticipantStatus;
};

export type ParticipantReadyInput = {
  roomId: string;
  participantId: string;
  isReady: boolean;
};

export type GoalSubmitInput = {
  roomId: string;
  participantId: string;
  rawText: string;
};

export type GoalRefineInput = {
  rawGoal: string;
  sessionMinutes: number;
};

export type SessionStartInput = {
  roomId: string;
  participantId: string;
};

export type SessionEndInput = {
  roomId: string;
  participantId: string;
};

export type GoalAchievedInput = {
  roomId: string;
  participantId: string;
  achieved: boolean;
};

export type GoalRefinement = {
  refinedText: string;
  reason: string;
  source: 'ollama' | 'template';
};

export type GameStartInput = {
  roomId: string;
  participantId: string;
  kind: GameKind;
};

export type ExpressionReportInput = {
  roomId: string;
  participantId: string;
  gameId: string;
  roundId: string;
  signals?: ExpressionSignals;
  missionResult?: MissionResult;
};

export type BluffBetInput = {
  roomId: string;
  participantId: string;
  gameId: string;
  targetId: string;
  predictsCrack: boolean;
};

export type RelayAdvanceInput = {
  roomId: string;
  participantId: string;
  gameId: string;
  link: RelayLink;
};

export type GameRevealInput = {
  roomId: string;
  participantId: string;
  gameId: string;
};
