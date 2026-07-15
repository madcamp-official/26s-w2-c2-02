import type {
  BluffBet,
  BluffResult,
  CreateRoomInput,
  ExpressionSignals,
  FocusRankingEntry,
  GameKind,
  GameSession,
  Goal,
  HiddenMission,
  MissionResult,
  RelayLink,
  JoinRoomInput,
  Participant,
  ParticipantStatus,
  Room,
  RoomiMessage,
  RoomSession,
  RoomSettings,
  RoomSnapshot,
  StudySession,
  VideoJoinInfo
} from '@roomi/shared';
import {
  createInviteCode as createSharedInviteCode,
  normalizeInviteCode
} from '@roomi/shared';
import { defaultRoomSettings } from './default-settings';
import type { RoomStore } from './room-store';
import type { VideoProvider } from '../video/daily-video-provider';

type RoomUpdatedListener = (snapshot: RoomSnapshot) => void;
type RoomiMessageListener = (message: RoomiMessage) => void;
type AddRoomiMessageInput = Omit<RoomiMessage, 'id' | 'createdAt'>;
type GameUpdatedListener = (snapshot: RoomSnapshot, game: GameSession) => void;
type MissionAssignedListener = (roomId: string, mission: HiddenMission) => void;

export const hiddenMissionTemplates: ReadonlyArray<Omit<HiddenMission, 'id' | 'playerId'>> = [
  { prompt: '대화 사이에 몰래 윙크 2번 넣기', verify: 'wink_count', target: 2 },
  { prompt: '누가 말할 때 자연스럽게 윙크 3번 하기', verify: 'wink_count', target: 3 },
  { prompt: '카메라를 보며 아주 짧게 윙크 4번 하기', verify: 'wink_count', target: 4 },
  { prompt: '들키지 않게 작게 미소 3번 짓기', verify: 'smile_count', target: 3 },
  { prompt: '리액션할 때 자연스럽게 미소 4번 섞기', verify: 'smile_count', target: 4 },
  { prompt: '말을 듣는 척하며 조용히 미소 5번 만들기', verify: 'smile_count', target: 5 },
  { prompt: '이번 라운드 동안 입 크게 벌리지 않기', verify: 'no_jaw_open', target: 0 },
  { prompt: '웃겨도 입을 크게 열지 않고 버티기', verify: 'no_jaw_open', target: 0 },
  { prompt: '놀란 척하지 말고 입 벌림을 끝까지 숨기기', verify: 'no_jaw_open', target: 0 },
  { prompt: '눈썹을 살짝 3번 올리기', verify: 'brow_count', target: 3 },
  { prompt: '중요한 말이 나올 때 눈썹 리액션 4번 하기', verify: 'brow_count', target: 4 },
  { prompt: '카메라 쪽으로 눈썹을 5번 들어 올리기', verify: 'brow_count', target: 5 },
  { prompt: '볼을 조용히 2번 부풀리기', verify: 'cheek_puff_count', target: 2 },
  { prompt: '아무도 모르게 짧은 볼 puff 4번 넣기', verify: 'cheek_puff_count', target: 4 }
];

type FocusTrackerEntry = {
  focusedSeconds: number;
  lastStatusChangeAt: number;
  status: ParticipantStatus;
};

export class RoomService {
  private readonly dailyRooms = new Map<string, { name: string; roomUrl: string }>();
  private readonly roomUpdatedListeners = new Set<RoomUpdatedListener>();
  private readonly roomiMessageListeners = new Set<RoomiMessageListener>();
  private readonly gameUpdatedListeners = new Set<GameUpdatedListener>();
  private readonly missionAssignedListeners = new Set<MissionAssignedListener>();
  // Keyed by roomId, then participantId. Every ParticipantStatus transition funnels through
  // updateParticipantStatus, so this is the single seam a future focus-detection integration
  // (MediaPipe, ML) needs to call into — no other ranking code has to change.
  private readonly focusTrackers = new Map<string, Map<string, FocusTrackerEntry>>();

  constructor(
    private readonly store: RoomStore,
    private readonly videoProvider?: VideoProvider
  ) {}

  async createRoomSession(input: CreateRoomInput): Promise<RoomSession> {
    const snapshot = this.createRoom(input);
    const currentParticipant = snapshot.participants[0];

    let videoJoin: VideoJoinInfo | undefined;
    try {
      videoJoin = await this.createVideoJoin(snapshot, currentParticipant);
    } catch (error) {
      this.leaveRoom(snapshot.room.id, currentParticipant.id);
      throw error;
    }

    return {
      snapshot: this.snapshotForParticipant(snapshot.room.id, currentParticipant.id),
      currentParticipantId: currentParticipant.id,
      videoJoin
    };
  }

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
      roomiMessages: []
    };

    this.store.saveRoom(snapshot);
    return snapshot;
  }

  async joinRoomSession(input: JoinRoomInput): Promise<RoomSession> {
    const snapshot = this.joinRoom(input);
    const currentParticipant = snapshot.participants.at(-1);

    if (!currentParticipant) {
      throw new Error('Participant was not created');
    }

    let videoJoin: VideoJoinInfo | undefined;
    try {
      videoJoin = await this.createVideoJoin(snapshot, currentParticipant);
    } catch (error) {
      this.leaveRoom(snapshot.room.id, currentParticipant.id);
      throw error;
    }

    return {
      snapshot: this.snapshotForParticipant(snapshot.room.id, currentParticipant.id),
      currentParticipantId: currentParticipant.id,
      videoJoin
    };
  }

  joinRoom(input: JoinRoomInput): RoomSnapshot {
    const snapshot = this.store.findByInviteCode(normalizeInviteCode(input.inviteCode));

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
    this.emitRoomUpdated(snapshot);
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

    this.touchFocusTracker(roomId, participantId, status, Date.now());

    snapshot.participants = snapshot.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, status, lastSeenAt: new Date().toISOString() }
        : participant
    );
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  setReady(roomId: string, participantId: string, isReady: boolean): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    snapshot.participants = snapshot.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, isReady, lastSeenAt: new Date().toISOString() }
        : participant
    );
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  submitGoal(roomId: string, participantId: string, rawText: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const participantExists = snapshot.participants.some(
      (participant) => participant.id === participantId
    );

    if (!participantExists) {
      throw new Error('Participant not found');
    }

    const existing = snapshot.goals.find((goal) => goal.participantId === participantId);

    if (existing) {
      // Re-submitting replaces the raw text and invalidates any prior refinement.
      snapshot.goals = snapshot.goals.map((goal) =>
        goal.participantId === participantId
          ? { ...goal, rawText, refinedText: undefined }
          : goal
      );
    } else {
      const goal: Goal = {
        id: crypto.randomUUID(),
        roomId,
        participantId,
        rawText,
        createdAt: new Date().toISOString()
      };
      snapshot.goals = [...snapshot.goals, goal];
    }

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  startSession(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const host = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    if (!host || host.role !== 'host') {
      throw new Error('Only the host can start the session');
    }

    if (snapshot.room.status !== 'waiting' && snapshot.room.status !== 'ended') {
      throw new Error('Session already started');
    }

    const now = new Date().toISOString();
    const session: StudySession = {
      id: crypto.randomUUID(),
      roomId,
      startedAt: now,
      plannedMinutes: snapshot.room.settings.sessionMinutes,
      mode: 'study'
    };

    snapshot.room = { ...snapshot.room, status: 'studying' };
    snapshot.currentSession = session;
    snapshot.participants = snapshot.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, status: 'focused', lastSeenAt: now }
        : participant
    );

    const nowMs = Date.now();
    const tracker = new Map<string, FocusTrackerEntry>();
    this.focusTrackers.set(roomId, tracker);
    snapshot.participants.forEach((participant) => {
      tracker.set(participant.id, {
        focusedSeconds: 0,
        lastStatusChangeAt: nowMs,
        status: participant.status
      });
    });

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  startBreak(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const host = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    if (!host || host.role !== 'host') {
      throw new Error('Only the host can start a break');
    }

    if (snapshot.room.settings.activityKind !== 'study') {
      throw new Error('Breaks are only available in study mode');
    }

    if (snapshot.room.settings.breakMode !== 'room') {
      throw new Error('Break mode is not room-wide');
    }

    if (!snapshot.currentSession || snapshot.currentSession.mode !== 'study') {
      throw new Error('No active study session to pause');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const breakEndsAt = new Date(
      nowMs + snapshot.room.settings.breakMinutes * 60_000
    ).toISOString();

    snapshot.room = { ...snapshot.room, status: 'break' };
    snapshot.currentSession = { ...snapshot.currentSession, mode: 'break', breakEndsAt };
    snapshot.participants = snapshot.participants.map((participant) => ({
      ...participant,
      status: 'break',
      lastSeenAt: now
    }));

    const tracker = this.focusTrackers.get(roomId);
    tracker?.forEach((entry) => {
      this.accrueFocusedSeconds(entry, nowMs);
      entry.status = 'break';
    });

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  endBreak(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const host = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    if (!host || host.role !== 'host') {
      throw new Error('Only the host can end a break');
    }

    if (!snapshot.currentSession || snapshot.currentSession.mode !== 'break') {
      throw new Error('No active break to end');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    snapshot.room = { ...snapshot.room, status: 'studying' };
    snapshot.currentSession = {
      ...snapshot.currentSession,
      mode: 'study',
      breakEndsAt: undefined
    };
    snapshot.participants = snapshot.participants.map((participant) => ({
      ...participant,
      status: 'focused',
      lastSeenAt: now
    }));

    const tracker = this.focusTrackers.get(roomId);
    tracker?.forEach((entry) => {
      entry.lastStatusChangeAt = nowMs;
      entry.status = 'focused';
    });

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  extendBreak(roomId: string, participantId: string, minutes: number): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const host = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    if (!host || host.role !== 'host') {
      throw new Error('Only the host can extend a break');
    }

    if (!snapshot.currentSession || snapshot.currentSession.mode !== 'break' || !snapshot.currentSession.breakEndsAt) {
      throw new Error('No active break to extend');
    }

    const breakEndsAt = new Date(
      Date.parse(snapshot.currentSession.breakEndsAt) + minutes * 60_000
    ).toISOString();

    snapshot.currentSession = { ...snapshot.currentSession, breakEndsAt };
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  endSession(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const host = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    if (!host || host.role !== 'host') {
      throw new Error('Only the host can end the session');
    }

    if (!snapshot.currentSession || snapshot.room.status === 'ended') {
      throw new Error('No active session to end');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    snapshot.room = { ...snapshot.room, status: 'ended' };
    snapshot.currentSession = {
      ...snapshot.currentSession,
      endedAt: now,
      mode: 'ended'
    };

    const tracker = this.focusTrackers.get(roomId);
    tracker?.forEach((entry) => this.accrueFocusedSeconds(entry, nowMs));

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  getFocusRanking(roomId: string): FocusRankingEntry[] {
    const tracker = this.focusTrackers.get(roomId);

    if (!tracker) {
      return [];
    }

    return Array.from(tracker.entries())
      .map(([participantId, entry]) => ({
        participantId,
        focusMinutes: Math.round(entry.focusedSeconds / 60)
      }))
      .sort((left, right) => right.focusMinutes - left.focusMinutes);
  }

  attachSessionSummary(roomId: string, summary: NonNullable<StudySession['summary']>): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot || !snapshot.currentSession) {
      throw new Error('No session to attach a summary to');
    }

    snapshot.currentSession = { ...snapshot.currentSession, summary };
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  setGoalAchieved(roomId: string, participantId: string, achieved: boolean): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const existing = snapshot.goals.find((goal) => goal.participantId === participantId);

    if (!existing) {
      throw new Error('Goal not found');
    }

    snapshot.goals = snapshot.goals.map((goal) =>
      goal.participantId === participantId ? { ...goal, achieved } : goal
    );
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  startGame(roomId: string, participantId: string, kind: GameKind): GameSession {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) throw new Error('Room not found');

    const host = snapshot.participants.find((participant) => participant.id === participantId);
    if (!host || host.role !== 'host') throw new Error('Only the host can start the game');

    const now = new Date().toISOString();
    const gameId = crypto.randomUUID();
    const game: GameSession = {
      id: gameId,
      roomId,
      kind,
      status: 'in_round',
      round: {
        id: crypto.randomUUID(),
        gameId,
        index: 1,
        status: 'in_round',
        startedAt: now,
        endsAt: new Date(Date.now() + 90_000).toISOString()
      },
      scores: snapshot.participants.map((participant) => ({
        participantId: participant.id,
        points: 0
      })),
      missions: kind === 'hidden_mission' ? this.createHiddenMissions(snapshot.participants) : [],
      missionResults: [],
      bluffBets: kind === 'poker_bluff' ? [] : undefined,
      relayLinks: kind === 'copycat_relay' ? [] : undefined,
      createdAt: now,
      updatedAt: now
    };

    snapshot.currentGame = game;
    snapshot.room = { ...snapshot.room, status: 'studying' };
    snapshot.participants = snapshot.participants.map((participant) => ({
      ...participant,
      status: 'focused',
      lastSeenAt: now
    }));
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    this.emitGameUpdated(snapshot, game);
    game.missions?.forEach((mission) => this.emitMissionAssigned(roomId, mission));
    return game;
  }

  recordMissionResult(roomId: string, result: MissionResult): GameSession {
    const snapshot = this.store.findByRoomId(roomId);
    if (!snapshot?.currentGame) throw new Error('No active game');

    const game = snapshot.currentGame;
    if (game.kind !== 'hidden_mission') throw new Error('Mission results require hidden mission');
    if (!game.missions?.some((mission) => mission.id === result.missionId && mission.playerId === result.playerId)) {
      throw new Error('Mission not found');
    }

    const missionResults = [
      ...(game.missionResults ?? []).filter((item) => item.playerId !== result.playerId),
      result
    ];
    snapshot.currentGame = {
      ...game,
      missionResults,
      updatedAt: new Date().toISOString()
    };
    this.store.update(snapshot);
    this.emitGameUpdated(snapshot, snapshot.currentGame);
    return snapshot.currentGame;
  }

  placeBluffBet(roomId: string, bet: BluffBet): GameSession {
    const snapshot = this.store.findByRoomId(roomId);
    if (!snapshot?.currentGame) throw new Error('No active game');
    if (snapshot.currentGame.kind !== 'poker_bluff') {
      throw new Error('Bluff bets require poker bluff');
    }

    const participantExists = snapshot.participants.some(
      (participant) => participant.id === bet.participantId
    );
    const targetExists = snapshot.participants.some(
      (participant) => participant.id === bet.targetId
    );
    if (!participantExists || !targetExists) throw new Error('Participant not found');

    const bluffBets = [
      ...(snapshot.currentGame.bluffBets ?? []).filter(
        (item) => item.participantId !== bet.participantId
      ),
      bet
    ];
    snapshot.currentGame = {
      ...snapshot.currentGame,
      status: 'guessing',
      round: { ...snapshot.currentGame.round, status: 'guessing' },
      bluffBets,
      updatedAt: new Date().toISOString()
    };
    this.store.update(snapshot);
    this.emitGameUpdated(snapshot, snapshot.currentGame);
    return snapshot.currentGame;
  }

  recordBluffResult(
    roomId: string,
    targetId: string,
    signals: ExpressionSignals
  ): GameSession {
    const snapshot = this.store.findByRoomId(roomId);
    if (!snapshot?.currentGame) throw new Error('No active game');
    if (snapshot.currentGame.kind !== 'poker_bluff') {
      throw new Error('Bluff results require poker bluff');
    }

    const result = this.bluffResultFromSignals(targetId, signals);
    const scores = snapshot.currentGame.scores.map((score) => {
      const matchedBet = snapshot.currentGame?.bluffBets?.find(
        (bet) => bet.participantId === score.participantId
      );
      const betPoints =
        matchedBet && matchedBet.predictsCrack === result.cracked ? 4 : 0;
      const targetPoints = score.participantId === targetId && !result.cracked ? 8 : 0;
      return { ...score, points: score.points + betPoints + targetPoints };
    });

    snapshot.currentGame = {
      ...snapshot.currentGame,
      bluffResult: result,
      scores,
      updatedAt: new Date().toISOString()
    };
    this.store.update(snapshot);
    this.emitGameUpdated(snapshot, snapshot.currentGame);
    return snapshot.currentGame;
  }

  advanceRelay(roomId: string, link: RelayLink): GameSession {
    const snapshot = this.store.findByRoomId(roomId);
    if (!snapshot?.currentGame) throw new Error('No active game');
    if (snapshot.currentGame.kind !== 'copycat_relay') {
      throw new Error('Relay links require copycat relay');
    }

    const participantIds = new Set(snapshot.participants.map((participant) => participant.id));
    if (!participantIds.has(link.fromId) || !participantIds.has(link.toId)) {
      throw new Error('Participant not found');
    }

    const normalizedLink = {
      ...link,
      similarity: Math.max(0, Math.min(1, link.similarity))
    };
    const scores = snapshot.currentGame.scores.map((score) =>
      score.participantId === link.toId
        ? { ...score, points: score.points + Math.round(normalizedLink.similarity * 10) }
        : score
    );

    snapshot.currentGame = {
      ...snapshot.currentGame,
      relayLinks: [...(snapshot.currentGame.relayLinks ?? []), normalizedLink],
      scores,
      updatedAt: new Date().toISOString()
    };
    this.store.update(snapshot);
    this.emitGameUpdated(snapshot, snapshot.currentGame);
    return snapshot.currentGame;
  }

  revealGame(roomId: string, participantId: string, gameId: string): GameSession {
    const snapshot = this.store.findByRoomId(roomId);
    if (!snapshot?.currentGame || snapshot.currentGame.id !== gameId) {
      throw new Error('No active game');
    }

    const requester = snapshot.participants.find((participant) => participant.id === participantId);
    if (!requester) throw new Error('Participant not found');
    if (requester.role !== 'host') throw new Error('Only the host can reveal the game');

    const now = new Date().toISOString();
    const results = snapshot.currentGame.missionResults ?? [];
    const scores =
      snapshot.currentGame.kind === 'hidden_mission'
        ? snapshot.currentGame.scores.map((score) => {
            const success = results.find(
              (result) => result.playerId === score.participantId
            )?.success;
            return { ...score, points: score.points + (success ? 10 : 0) };
          })
        : snapshot.currentGame.scores;

    snapshot.currentGame = {
      ...snapshot.currentGame,
      status: 'reveal',
      round: { ...snapshot.currentGame.round, status: 'reveal', revealAt: now },
      scores,
      updatedAt: now
    };
    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    this.emitGameUpdated(snapshot, snapshot.currentGame);
    return snapshot.currentGame;
  }

  leaveRoom(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    const leavingParticipant = snapshot.participants.find(
      (participant) => participant.id === participantId
    );

    snapshot.participants = snapshot.participants.filter(
      (participant) => participant.id !== participantId
    );

    if (snapshot.participants.length === 0) {
      this.deleteDailyRoom(snapshot.room.id);
    }

    if (leavingParticipant?.role === 'host' && snapshot.participants.length > 0) {
      const nextHost = [...snapshot.participants].sort(
        (left, right) => Date.parse(left.joinedAt) - Date.parse(right.joinedAt)
      )[0]!;

      snapshot.room = { ...snapshot.room, hostUserId: nextHost.userId };
      snapshot.participants = snapshot.participants.map((participant) =>
        participant.id === nextHost.id
          ? { ...participant, role: 'host' }
          : { ...participant, role: 'member' }
      );
    }

    this.store.update(snapshot);
    this.emitRoomUpdated(snapshot);
    return snapshot;
  }

  getByInviteCode(inviteCode: string): RoomSnapshot | undefined {
    const snapshot = this.store.findByInviteCode(normalizeInviteCode(inviteCode));
    return snapshot ? this.withVisibleMessages(snapshot) : undefined;
  }

  getByRoomId(roomId: string): RoomSnapshot | undefined {
    return this.store.findByRoomId(roomId);
  }

  snapshotForParticipant(roomId: string, participantId: string): RoomSnapshot {
    const snapshot = this.store.findByRoomId(roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    if (!snapshot.participants.some((participant) => participant.id === participantId)) {
      throw new Error('Participant not found');
    }

    return this.withVisibleMessages(snapshot, participantId);
  }

  onRoomUpdated(listener: RoomUpdatedListener): () => void {
    this.roomUpdatedListeners.add(listener);

    return () => {
      this.roomUpdatedListeners.delete(listener);
    };
  }

  addRoomiMessage(input: AddRoomiMessageInput): RoomiMessage {
    const snapshot = this.store.findByRoomId(input.roomId);

    if (!snapshot) {
      throw new Error('Room not found');
    }

    if (
      input.targetParticipantId &&
      !snapshot.participants.some((participant) => participant.id === input.targetParticipantId)
    ) {
      throw new Error('Target participant not found');
    }

    const message: RoomiMessage = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };

    snapshot.roomiMessages = [...snapshot.roomiMessages, message];
    this.store.update(snapshot);
    this.roomiMessageListeners.forEach((listener) => listener(message));
    return message;
  }

  onRoomiMessage(listener: RoomiMessageListener): () => void {
    this.roomiMessageListeners.add(listener);

    return () => {
      this.roomiMessageListeners.delete(listener);
    };
  }

  onGameUpdated(listener: GameUpdatedListener): () => void {
    this.gameUpdatedListeners.add(listener);
    return () => this.gameUpdatedListeners.delete(listener);
  }

  onMissionAssigned(listener: MissionAssignedListener): () => void {
    this.missionAssignedListeners.add(listener);
    return () => this.missionAssignedListeners.delete(listener);
  }

  private touchFocusTracker(
    roomId: string,
    participantId: string,
    status: ParticipantStatus,
    nowMs: number
  ): void {
    let tracker = this.focusTrackers.get(roomId);

    if (!tracker) {
      tracker = new Map();
      this.focusTrackers.set(roomId, tracker);
    }

    const entry = tracker.get(participantId);

    if (!entry) {
      // Lazy init covers a participant who joins mid-session, or the first status
      // change of any kind for a room with no tracker yet.
      tracker.set(participantId, { focusedSeconds: 0, lastStatusChangeAt: nowMs, status });
      return;
    }

    this.accrueFocusedSeconds(entry, nowMs);
    entry.status = status;
  }

  private accrueFocusedSeconds(entry: FocusTrackerEntry, nowMs: number): void {
    if (entry.status === 'focused') {
      entry.focusedSeconds += Math.max(0, (nowMs - entry.lastStatusChangeAt) / 1000);
    }
    entry.lastStatusChangeAt = nowMs;
  }

  private mergeSettings(settings: Partial<RoomSettings> | undefined): RoomSettings {
    return {
      ...defaultRoomSettings,
      ...settings,
      maxParticipants: 4,
      authMode: 'nickname_code',
      videoProvider: 'daily',
      roomiTone: 'friendly_casual',
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
      isReady: false,
      scoreVisible: input.scoreVisible,
      joinedAt: input.now,
      lastSeenAt: input.now
    };
  }

  private createInviteCode(): string {
    return createSharedInviteCode();
  }

  private createHiddenMissions(participants: Participant[]): HiddenMission[] {
    const shuffled = [...hiddenMissionTemplates].sort(() => Math.random() - 0.5);
    return participants.map((participant, index) => {
      const template = shuffled[index % shuffled.length]!;
      return {
        id: crypto.randomUUID(),
        playerId: participant.id,
        ...template
      };
    });
  }

  private bluffResultFromSignals(targetId: string, signals: ExpressionSignals): BluffResult {
    const tell =
      signals.smile >= 0.58
        ? 'smile'
        : signals.jawOpen >= 0.45
          ? 'jaw'
          : signals.browRaise >= 0.5
            ? 'brow'
            : null;

    return {
      targetId,
      cracked: tell !== null,
      tell,
      heldMs: Math.max(0, Date.now() - signals.timestamp)
    };
  }

  private async createVideoJoin(
    snapshot: RoomSnapshot,
    participant: Participant
  ): Promise<VideoJoinInfo | undefined> {
    if (!this.videoProvider) {
      return undefined;
    }

    let dailyRoom = this.dailyRooms.get(snapshot.room.id);

    if (!dailyRoom) {
      dailyRoom = await this.videoProvider.createRoom(
        snapshot.room.id,
        snapshot.room.settings.maxParticipants
      );
      this.dailyRooms.set(snapshot.room.id, dailyRoom);
    }

    const joinInfo = await this.videoProvider.createJoinInfo({
      dailyRoomName: dailyRoom.name,
      roomUrl: dailyRoom.roomUrl,
      userId: participant.id,
      userName: participant.nickname,
      isOwner: participant.role === 'host',
      sessionMinutes: snapshot.room.settings.sessionMinutes
    });

    return {
      provider: 'daily',
      roomUrl: joinInfo.roomUrl,
      token: joinInfo.token
    };
  }

  private deleteDailyRoom(roomId: string) {
    const dailyRoom = this.dailyRooms.get(roomId);

    if (!dailyRoom || !this.videoProvider) {
      return;
    }

    this.dailyRooms.delete(roomId);
    void this.videoProvider.deleteRoom(dailyRoom.name).catch((error) => {
      console.warn(error instanceof Error ? error.message : 'Daily room deletion failed');
    });
  }

  private emitRoomUpdated(snapshot: RoomSnapshot) {
    this.roomUpdatedListeners.forEach((listener) => listener(snapshot));
  }

  private emitGameUpdated(snapshot: RoomSnapshot, game: GameSession) {
    this.gameUpdatedListeners.forEach((listener) => listener(snapshot, game));
  }

  private emitMissionAssigned(roomId: string, mission: HiddenMission) {
    this.missionAssignedListeners.forEach((listener) => listener(roomId, mission));
  }

  private withVisibleMessages(snapshot: RoomSnapshot, participantId?: string): RoomSnapshot {
    const currentGame = snapshot.currentGame
      ? {
          ...snapshot.currentGame,
          missions: snapshot.currentGame.missions?.filter(
            (mission) =>
              snapshot.currentGame?.status === 'reveal' ||
              (participantId !== undefined && mission.playerId === participantId)
          )
        }
      : snapshot.currentGame;

    return {
      ...snapshot,
      currentGame,
      roomiMessages: snapshot.roomiMessages.filter(
        (message) => !message.targetParticipantId || message.targetParticipantId === participantId
      )
    };
  }
}
