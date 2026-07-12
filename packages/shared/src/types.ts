export type ISODateString = string;

export type RoomStatus = 'waiting' | 'studying' | 'break' | 'ended';

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
  sessionMinutes: number;
  breakMode: 'room' | 'individual';
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
  createdAt: ISODateString;
};

export type RoomiMessage = {
  id: string;
  roomId: string;
  kind: 'goal_refine' | 'start' | 'focus_recovery' | 'break_return' | 'summary';
  text: string;
  targetParticipantId?: string;
  createdAt: ISODateString;
};

export type RoomSnapshot = {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
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

export type UpdateParticipantStatusInput = {
  roomId: string;
  participantId: string;
  status: ParticipantStatus;
};
