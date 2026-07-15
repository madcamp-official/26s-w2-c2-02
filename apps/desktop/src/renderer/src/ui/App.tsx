import { useEffect, useRef, useState } from 'react';
import {
  createInviteCode,
  normalizeInviteCode,
  type BluffBet,
  type BluffTell,
  type ChatMessage,
  type ExpressionSignals,
  type FocusRankingEntry,
  type GameKind,
  type GameSession,
  type Goal,
  type HiddenMission,
  type MissionResult,
  type Participant,
  type ParticipantStatus,
  type Room,
  type RoomiMessage,
  type RoomSettings,
  type RoomSession,
  type StudySession,
  type VideoJoinInfo
} from '@roomi/shared';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@roomi/shared';
import { WindowTitleBar } from './components/WindowTitleBar';
import { OnboardingNickname } from './screens/OnboardingNickname';
import { OnboardingCreate } from './screens/OnboardingCreate';
import { OnboardingJoin } from './screens/OnboardingJoin';
import { OnboardingPermission } from './screens/OnboardingPermission';
import { MediaPipeTest } from './screens/MediaPipeTest';
import { CreateRoom } from './screens/CreateRoom';
import { WaitingRoom } from './screens/WaitingRoom';
import { StudyRoom } from './screens/StudyRoom';
import { BreakReturn } from './screens/BreakReturn';
import { Retrospective } from './screens/Retrospective';
import type { ScreenId } from './screens/types';
import {
  advanceRelay,
  createRoomSession,
  createRoomSocket,
  endBreak,
  endSession,
  extendBreak,
  joinRoomSession,
  leaveRoom,
  markNextRoundReady,
  placeBluffBet,
  refineGoal,
  reportExpression,
  revealGame,
  RoomApiError,
  sendChatMessage,
  setGoalAchieved,
  startBreak,
  startGame,
  startSession,
  submitGoal,
  subscribeToRoom,
  updateParticipantStatus
} from '../room-client';

type MediaPermissionState = 'idle' | 'checking' | 'granted' | 'denied';

type RoomDraft = {
  currentParticipantId: string;
  room: Room;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  chatMessages: ChatMessage[];
  focusRanking: FocusRankingEntry[];
  currentSession?: StudySession;
  currentGame?: GameSession;
  privateMission?: HiddenMission;
  realtime: 'local' | 'server';
  videoJoin?: VideoJoinInfo;
};

const now = () => new Date().toISOString();
const LOCAL_ROOMI_MESSAGE_LIMIT = 20;

const defaultRoomSettings: RoomSettings = {
  activityKind: 'study',
  defaultGameKind: 'hidden_mission',
  sessionMinutes: 50,
  roundCount: 3,
  breakMode: 'room',
  breakMinutes: 10,
  defaultScoreVisibility: 'public',
  maxParticipants: 4,
  authMode: 'nickname_code',
  videoProvider: 'daily',
  roomiTone: 'friendly_casual',
  rankingMetric: 'focus_minutes',
  videoRequired: true,
  detectionPauseAllowed: true
};

const fallbackRoom: RoomDraft = createRoomDraft('참가자', defaultRoomSettings);

function createParticipant(input: {
  id: string;
  roomId: string;
  userId: string;
  nickname: string;
  role: Participant['role'];
  status?: ParticipantStatus;
}): Participant {
  const timestamp = now();
  return {
    id: input.id,
    roomId: input.roomId,
    userId: input.userId,
    nickname: input.nickname,
    role: input.role,
    status: input.status ?? 'online',
    isReady: false,
    scoreVisible: true,
    joinedAt: timestamp,
    lastSeenAt: timestamp
  };
}

function createRoomDraft(nickname: string, settings: RoomSettings): RoomDraft {
  const timestamp = now();
  const roomId = `room-${Date.now()}`;
  const userId = `user-${Date.now()}`;
  const participantId = `participant-${Date.now()}`;
  return {
    currentParticipantId: participantId,
    realtime: 'local',
    room: {
      id: roomId,
      inviteCode: createInviteCode(),
      hostUserId: userId,
      settings,
      status: 'waiting',
      createdAt: timestamp
    },
    participants: [
      createParticipant({
        id: participantId,
        roomId,
        userId,
        nickname,
        role: 'host'
      })
    ],
    goals: [],
    roomiMessages: [],
    chatMessages: [],
    focusRanking: []
  };
}

function joinRoomDraft(nickname: string, inviteCode: string): RoomDraft {
  const timestamp = now();
  const roomId = `room-${inviteCode || 'demo'}`;
  const participantId = `participant-${Date.now()}`;
  return {
    currentParticipantId: participantId,
    realtime: 'local',
    room: {
      id: roomId,
      inviteCode: inviteCode || '7KQ2MD',
      hostUserId: 'user-host',
      settings: defaultRoomSettings,
      status: 'waiting',
      createdAt: timestamp
    },
    participants: [
      createParticipant({
        id: 'participant-host',
        roomId,
        userId: 'user-host',
        nickname: 'Host',
        role: 'host'
      }),
      createParticipant({
        id: participantId,
        roomId,
        userId: `user-${Date.now()}`,
        nickname,
        role: 'member'
      })
    ],
    goals: [],
    roomiMessages: [],
    chatMessages: [],
    focusRanking: []
  };
}

function roomSessionToDraft(session: RoomSession): RoomDraft {
  return {
    currentParticipantId: session.currentParticipantId,
    realtime: 'server',
    room: session.snapshot.room,
    participants: session.snapshot.participants,
    goals: session.snapshot.goals,
    roomiMessages: session.snapshot.roomiMessages,
    chatMessages: session.snapshot.chatMessages,
    focusRanking: [],
    currentSession: session.snapshot.currentSession,
    currentGame: session.snapshot.currentGame,
    privateMission: session.snapshot.currentGame?.missions?.find(
      (mission) => mission.playerId === session.currentParticipantId
    ),
    videoJoin: session.videoJoin
  };
}

function createLocalGame(
  room: Room,
  participants: Participant[],
  kind: GameKind,
  previousMissions: HiddenMission[] = []
): GameSession {
  const timestamp = now();
  const gameId = `game-${Date.now()}`;
  const templates: Array<Omit<HiddenMission, 'id' | 'playerId'>> = [
    { prompt: '들키지 않게 윙크 4번 하기', verify: 'wink_count', target: 4 },
    { prompt: '듣는 척하며 짧은 윙크 5번 섞기', verify: 'wink_count', target: 5 },
    { prompt: '다른 사람이 말할 때 윙크 6번 넣기', verify: 'wink_count', target: 6 },
    { prompt: '자연스럽게 미소 5번 짓기', verify: 'smile_count', target: 5 },
    { prompt: '작은 미소 리액션 6번 하기', verify: 'smile_count', target: 6 },
    { prompt: '아무 말 없이 조용히 미소 7번 만들기', verify: 'smile_count', target: 7 },
    { prompt: '대답하기 직전에 입을 살짝 4번 벌리기', verify: 'jaw_open_count', target: 4 },
    { prompt: '놀란 척 아주 짧게 입을 5번 열기', verify: 'jaw_open_count', target: 5 },
    { prompt: '눈썹을 살짝 5번 올리기', verify: 'brow_count', target: 5 },
    { prompt: '반응할 때 눈썹을 6번 들어 올리기', verify: 'brow_count', target: 6 },
    { prompt: '카메라 쪽으로 눈썹을 7번 올리기', verify: 'brow_count', target: 7 },
    { prompt: '듣는 척하면서 고개를 4번 살짝 끄덕이기', verify: 'nod_count', target: 4 },
    { prompt: '상대 말 끝에 맞춰 고개를 5번 작게 끄덕이기', verify: 'nod_count', target: 5 },
    { prompt: '생각난 척 고개를 6번 짧게 끄덕이기', verify: 'nod_count', target: 6 }
  ];
  const shuffled = [...templates].sort(() => Math.random() - 0.5);

  return {
    id: gameId,
    roomId: room.id,
    kind,
    status: 'in_round',
    round: {
      id: `round-${Date.now()}`,
      gameId,
      index: 1,
      status: 'in_round',
      startedAt: timestamp,
      endsAt: new Date(Date.now() + 90_000).toISOString()
    },
    totalRounds: Math.max(1, room.settings.roundCount ?? 1),
    completedRounds: [],
    nextRoundReadyParticipantIds: [],
    scores: participants.map((participant) => ({
      participantId: participant.id,
      points: 0
    })),
    missions:
      kind === 'hidden_mission'
        ? participants.map((participant, index) => {
            const previousPrompt = previousMissions.find(
              (mission) => mission.playerId === participant.id
            )?.prompt;
            let template = shuffled[index % shuffled.length]!;
            if (template.prompt === previousPrompt) {
              template = shuffled[(index + 1) % shuffled.length]!;
            }
            return {
              id: `mission-${gameId}-${participant.id}-${index}`,
              playerId: participant.id,
              ...template
            };
          })
        : [],
    missionResults: [],
    bluffBets: kind === 'poker_bluff' ? [] : undefined,
    relayLinks: kind === 'copycat_relay' ? [] : undefined,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>('onboarding-nickname');
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | undefined>();
  const [createError, setCreateError] = useState<string | undefined>();
  const [mediaPermission, setMediaPermission] = useState<MediaPermissionState>('idle');
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const createRoomLockRef = useRef(false);
  const joinRoomLockRef = useRef(false);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const go = (id: ScreenId) => setScreen(id);
  const activeRoom = roomDraft ?? fallbackRoom;
  const currentParticipant = activeRoom.participants.find(
    (participant) => participant.id === activeRoom.currentParticipantId
  );
  const isHost = currentParticipant?.role === 'host';

  const resetRoomRequestState = () => {
    createRoomLockRef.current = false;
    joinRoomLockRef.current = false;
    setIsCreatingRoom(false);
    setIsJoiningRoom(false);
  };

  const returnHome = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setRoomDraft(null);
    setJoinCode('');
    setJoinError(undefined);
    setCreateError(undefined);
    resetRoomRequestState();
    go('onboarding-nickname');
  };

  useEffect(() => {
    if (!roomDraft || roomDraft.realtime !== 'server') return undefined;

    const socket = createRoomSocket();
    socketRef.current = socket;

    return subscribeToRoom(
      socket,
      {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId
      },
      (snapshot) => {
        setRoomDraft((current) =>
          current && current.room.id === snapshot.room.id
            ? {
                ...current,
                room: snapshot.room,
                participants: snapshot.participants,
                goals: snapshot.goals,
                roomiMessages: snapshot.roomiMessages,
                currentSession: snapshot.currentSession,
                currentGame: snapshot.currentGame,
                privateMission: resolvePrivateMission(current, snapshot.currentGame)
              }
            : current
        );
      },
      (message) => {
        setRoomDraft((current) =>
          current && current.room.id === message.roomId
            ? { ...current, roomiMessages: [...current.roomiMessages, message].slice(-20) }
            : current
        );
      },
      (game) => {
        setRoomDraft((current) =>
          current && current.room.id === game.roomId
            ? {
                ...current,
                currentGame: game,
                privateMission: resolvePrivateMission(current, game)
              }
            : current
        );
      },
      (mission) => {
        setRoomDraft((current) => (current ? { ...current, privateMission: mission } : current));
      },
      (result) => {
        setRoomDraft((current) =>
          current?.currentGame
            ? {
                ...current,
                currentGame: {
                  ...current.currentGame,
                  missionResults: [
                    ...(current.currentGame.missionResults ?? []).filter(
                      (item) => item.playerId !== result.playerId
                    ),
                    result
                  ]
                }
              }
            : current
        );
      },
      (game) => {
        setRoomDraft((current) =>
          current && current.room.id === game.roomId
            ? {
                ...current,
                currentGame: game,
                privateMission: resolvePrivateMission(current, game)
              }
            : current
        );
      },
      (message) => {
        setRoomDraft((current) =>
          current && current.room.id === message.roomId
            ? { ...current, chatMessages: [...current.chatMessages, message].slice(-30) }
            : current
        );
      },
      (message) => console.warn(`Room realtime error: ${message}`),
      (payload) => {
        setRoomDraft((current) =>
          current && current.room.id === payload.roomId
            ? { ...current, focusRanking: payload.ranking }
            : current
        );
      }
    );
  }, [roomDraft?.room.id, roomDraft?.realtime]);

  useEffect(() => {
    if (activeRoom.room.status === 'ended' && screen !== 'retrospective') go('retrospective');
  }, [activeRoom.room.status, screen]);

  useEffect(() => {
    if (
      !roomDraft ||
      roomDraft.realtime !== 'local' ||
      roomDraft.currentGame?.status !== 'between_round' ||
      !roomDraft.currentGame.nextRoundStartsAt
    ) {
      return undefined;
    }

    const delayMs = Math.max(0, Date.parse(roomDraft.currentGame.nextRoundStartsAt) - Date.now());
    const timer = window.setTimeout(() => {
      setRoomDraft((current) => {
        if (!current?.currentGame || current.currentGame.status !== 'between_round') return current;
        const currentGame = startNextLocalRound(current.room, current.participants, current.currentGame);
        return {
          ...current,
          currentGame,
          privateMission: resolvePrivateMission(current, currentGame)
        };
      });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [roomDraft?.currentGame?.id, roomDraft?.currentGame?.nextRoundStartsAt, roomDraft?.currentGame?.status, roomDraft?.realtime]);

  useEffect(() => {
    if (
      activeRoom.room.settings.activityKind === 'study' &&
      activeRoom.room.status === 'break' &&
      screen === 'study'
    ) {
      go('break');
      return;
    }

    if (
      activeRoom.room.status === 'studying' &&
      screen === 'break' &&
      activeRoom.room.settings.breakMode === 'room'
    ) {
      go('study');
    }
  }, [activeRoom.room.settings.activityKind, activeRoom.room.settings.breakMode, activeRoom.room.status, screen]);

  const createRoom = async (settings: RoomSettings) => {
    if (createRoomLockRef.current) return;
    createRoomLockRef.current = true;
    setIsCreatingRoom(true);
    const input = { nickname: nickname || '참가자', settings };
    setCreateError(undefined);

    try {
      setRoomDraft(roomSessionToDraft(await createRoomSession(input)));
    } catch (error) {
      if (!(error instanceof RoomApiError)) {
        console.warn(error instanceof Error ? error.message : 'Room create failed');
      }
      setRoomDraft(createRoomDraft(input.nickname, settings));
    }

    resetRoomRequestState();
    go(mediaPermission === 'granted' ? 'waiting' : 'onboarding-permission');
  };

  const joinRoom = async () => {
    if (joinRoomLockRef.current) return;
    joinRoomLockRef.current = true;
    setIsJoiningRoom(true);
    const input = { nickname: nickname || '참가자', inviteCode: normalizeInviteCode(joinCode) };
    setJoinError(undefined);

    try {
      setRoomDraft(roomSessionToDraft(await joinRoomSession(input)));
    } catch (error) {
      if (!(error instanceof RoomApiError)) {
        console.warn(error instanceof Error ? error.message : 'Room join failed');
      }
      setRoomDraft(joinRoomDraft(input.nickname, input.inviteCode || fallbackRoom.room.inviteCode));
    }

    resetRoomRequestState();
    go(mediaPermission === 'granted' ? 'waiting' : 'onboarding-permission');
  };

  const leaveCurrentRoom = () => {
    if (roomDraft?.realtime === 'server') {
      leaveRoom(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId
      });
    }
    resetRoomRequestState();
    setRoomDraft(null);
    go('onboarding-create');
  };

  const submitCurrentGoal = (rawText: string) => {
    if (!roomDraft) return;
    const participantId = roomDraft.currentParticipantId;
    if (roomDraft.realtime === 'server') {
      submitGoal({ roomId: roomDraft.room.id, participantId, rawText }).catch(() => {});
    }

    setRoomDraft((current) => {
      if (!current) return current;
      const existing = current.goals.find((goal) => goal.participantId === participantId);
      const goals = existing
        ? current.goals.map((goal) =>
            goal.participantId === participantId
              ? { ...goal, rawText, refinedText: undefined }
              : goal
          )
        : [
            ...current.goals,
            {
              id: `goal-${Date.now()}`,
              roomId: current.room.id,
              participantId,
              rawText,
              createdAt: now()
            }
          ];
      return { ...current, goals };
    });
  };

  const refineCurrentGoal = (rawGoal: string) => {
    const activityKind = activeRoom.room.settings.activityKind;
    const isPlayStyle = activityKind !== 'study';
    return refineGoal({
      rawGoal,
      sessionMinutes: activeRoom.room.settings.sessionMinutes,
      mode: isPlayStyle ? 'play_style' : 'study_goal',
      gameKind: isPlayStyle ? activityKind : activeRoom.room.settings.defaultGameKind
    }).catch(() => ({
      refinedText: isPlayStyle ? localPlayStyleFallback(activityKind, rawGoal) : rawGoal,
      reason: isPlayStyle
        ? '루미가 로컬 기본 스타일을 골랐어요.'
        : 'API를 사용할 수 없어 입력한 목표를 그대로 저장해요.',
      source: 'template' as const
    }));
  };

  const startCurrentGame = (
    kind: GameKind = roomDraft?.room.settings.defaultGameKind ?? 'hidden_mission'
  ) => {
    if (!roomDraft) return;
    if (roomDraft.room.settings.activityKind === 'study') return;

    if (roomDraft.realtime === 'server') {
      startGame(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        kind
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current) return current;
      const game = createLocalGame(current.room, current.participants, kind);
      const next: RoomDraft = {
        ...current,
        room: { ...current.room, status: 'studying' },
        currentGame: game,
        privateMission: game.missions?.find(
          (mission) => mission.playerId === current.currentParticipantId
        ),
        participants: current.participants.map((participant) => ({
          ...participant,
          status: 'focused',
          lastSeenAt: now()
        }))
      };
      const playStyles = current.goals
        .map((goal) => goal.rawText.trim())
        .filter(Boolean);
      return appendLocalRoomiMessage(
        next,
        'game_intro',
        localGameIntroMessage(kind, game.round.index, playStyles)
      );
    });
  };

  const startCurrentSession = async () => {
    if (!roomDraft) return;

    if (roomDraft.realtime === 'server') {
      const snapshot = await startSession({
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId
      });
      setRoomDraft((current) =>
        current
          ? {
              ...current,
              room: snapshot.room,
              participants: snapshot.participants,
              goals: snapshot.goals,
              roomiMessages: snapshot.roomiMessages,
              currentSession: snapshot.currentSession,
              currentGame: snapshot.currentGame
            }
          : current
      );
      go('study');
      return;
    }

    setRoomDraft((current) =>
      current
        ? {
            ...current,
            room: { ...current.room, status: 'studying' },
            participants: current.participants.map((participant) => ({
              ...participant,
              status: 'focused'
            })),
            currentSession: {
              id: `session-${Date.now()}`,
              roomId: current.room.id,
              startedAt: now(),
              plannedMinutes: current.room.settings.sessionMinutes,
              mode: 'study'
            },
            currentGame: undefined,
            privateMission: undefined
          }
        : current
    );
    go('study');
  };

  const setCurrentSessionPresence = (status: ParticipantStatus) => {
    if (!roomDraft) return;
    if (roomDraft.realtime === 'server') {
      updateParticipantStatus(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        status
      });
    }
    setRoomDraft((current) =>
      current
        ? {
            ...current,
            participants: current.participants.map((participant) =>
              participant.id === current.currentParticipantId
                ? { ...participant, status }
                : participant
            )
          }
        : current
    );
  };

  const joinCurrentSession = () => {
    setRoomDraft((current) => {
      if (
        !current ||
        current.realtime !== 'local' ||
        current.currentGame?.kind !== 'hidden_mission' ||
        current.currentGame.status !== 'in_round'
      ) {
        return current;
      }
      const participant = current.participants.find(
        (item) => item.id === current.currentParticipantId
      );
      if (participant?.status !== 'online') return current;

      const freshGame = createLocalGame(
        current.room,
        current.participants,
        'hidden_mission',
        current.currentGame.missions
      );
      const replacement = freshGame.missions?.find(
        (mission) => mission.playerId === current.currentParticipantId
      );
      if (!replacement) return current;

      const currentGame = {
        ...current.currentGame,
        missions: [
          ...(current.currentGame.missions ?? []).filter(
            (mission) => mission.playerId !== current.currentParticipantId
          ),
          replacement
        ],
        missionResults: (current.currentGame.missionResults ?? []).filter(
          (result) => result.playerId !== current.currentParticipantId
        ),
        updatedAt: now()
      };
      return { ...current, currentGame, privateMission: replacement };
    });
    setCurrentSessionPresence('focused');
    go('study');
  };

  const leaveCurrentSession = () => {
    if (!roomDraft) {
      go('retrospective');
      return;
    }

    if (roomDraft.realtime === 'server') {
      updateParticipantStatus(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        status: 'online'
      });
    }

    setRoomDraft((current) =>
      current ? buildRetrospectiveDraft(current, 'online') : current
    );
    go('retrospective');
  };

  const startCurrentBreak = async () => {
    if (!roomDraft) return;
    if (roomDraft.room.settings.activityKind !== 'study') return;
    if (roomDraft.room.settings.breakMode === 'individual') {
      setCurrentSessionPresence('break');
      go('break');
      return;
    }
    if (!isHost) return;

    if (roomDraft.realtime === 'server') {
      try {
        const snapshot = await startBreak({
          roomId: roomDraft.room.id,
          participantId: roomDraft.currentParticipantId
        });
        setRoomDraft((current) => (current ? { ...current, ...snapshotToDraftPatch(snapshot) } : current));
      } catch (error) {
        console.warn(error instanceof Error ? error.message : 'Break start failed');
      }
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentSession) return current;
      return {
        ...current,
        room: { ...current.room, status: 'break' },
        currentSession: {
          ...current.currentSession,
          mode: 'break',
          breakEndsAt: new Date(Date.now() + current.room.settings.breakMinutes * 60_000).toISOString()
        },
        participants: current.participants.map((participant) => ({ ...participant, status: 'break' }))
      };
    });
    go('break');
  };

  const endCurrentBreak = async () => {
    if (!roomDraft) return;
    if (roomDraft.room.settings.activityKind !== 'study') return;
    if (roomDraft.room.settings.breakMode === 'individual') {
      setCurrentSessionPresence('focused');
      go('study');
      return;
    }
    if (!isHost) return;

    if (roomDraft.realtime === 'server') {
      try {
        const snapshot = await endBreak({
          roomId: roomDraft.room.id,
          participantId: roomDraft.currentParticipantId
        });
        setRoomDraft((current) => (current ? { ...current, ...snapshotToDraftPatch(snapshot) } : current));
      } catch (error) {
        console.warn(error instanceof Error ? error.message : 'Break end failed');
      }
      return;
    }

    setRoomDraft((current) =>
      current?.currentSession
        ? {
            ...current,
            room: { ...current.room, status: 'studying' },
            currentSession: { ...current.currentSession, mode: 'study', breakEndsAt: undefined },
            participants: current.participants.map((participant) => ({
              ...participant,
              status: 'focused'
            }))
          }
        : current
    );
    go('study');
  };

  const extendCurrentBreak = async () => {
    if (
      !roomDraft ||
      roomDraft.room.settings.activityKind !== 'study' ||
      roomDraft.room.settings.breakMode !== 'room' ||
      !isHost
    ) return;
    if (roomDraft.realtime === 'server') {
      try {
        const snapshot = await extendBreak({
          roomId: roomDraft.room.id,
          participantId: roomDraft.currentParticipantId,
          minutes: 5
        });
        setRoomDraft((current) => (current ? { ...current, currentSession: snapshot.currentSession } : current));
      } catch (error) {
        console.warn(error instanceof Error ? error.message : 'Break extend failed');
      }
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentSession?.breakEndsAt) return current;
      return {
        ...current,
        currentSession: {
          ...current.currentSession,
          breakEndsAt: new Date(Date.parse(current.currentSession.breakEndsAt) + 5 * 60_000).toISOString()
        }
      };
    });
  };

  const submitCurrentMissionResult = (result: MissionResult) => {
    if (!roomDraft?.currentGame) return;
    if (roomDraft.realtime === 'server') {
      reportExpression(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        gameId: roomDraft.currentGame.id,
        roundId: roomDraft.currentGame.round.id,
        missionResult: result
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentGame) return current;
      const mission = current.currentGame.missions?.find(
        (item) => item.id === result.missionId && item.playerId === result.playerId
      );
      const next: RoomDraft = {
        ...current,
        currentGame: result.success ? finishLocalGameRound({
          ...current.currentGame,
          missionResults: [
            ...(current.currentGame.missionResults ?? []).filter(
              (item) => item.playerId !== result.playerId
            ),
            result
          ]
        }) : {
          ...current.currentGame,
          missionResults: [
            ...(current.currentGame.missionResults ?? []).filter(
              (item) => item.playerId !== result.playerId
            ),
            result
          ]
        }
      };
      if (mission && !result.success && mission.target - result.count === 1) {
        return appendLocalRoomiMessage(
          next,
          'round_prompt',
          '누군가 거의 미션을 끝낸 것 같은데...?'
        );
      }
      return next;
    });
  };

  const winCurrentRoundByMissionGuess = (winnerId: string, targetId: string, missionId: string) => {
    if (!roomDraft?.currentGame || roomDraft.currentGame.kind !== 'hidden_mission') return;
    if (roomDraft.realtime === 'server') return;

    setRoomDraft((current) => {
      if (!current?.currentGame || current.currentGame.kind !== 'hidden_mission') return current;
      const result: MissionResult = {
        playerId: targetId,
        missionId,
        count: 1,
        success: true
      };
      return appendLocalRoomiMessage(
        {
          ...current,
          currentGame: finishLocalGameRoundWithWinner({
            ...current.currentGame,
            missionResults: [
              ...(current.currentGame.missionResults ?? []).filter(
                (item) => item.playerId !== targetId
              ),
              result
            ]
          }, winnerId)
        },
        'game_reveal',
        `${participantNickname(current.participants, winnerId)}가 ${participantNickname(current.participants, targetId)}의 미션을 맞춰 라운드를 가져갔어.`
      );
    });
  };

  const submitCurrentChatMessage = (text: string) => {
    if (!roomDraft) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (roomDraft.realtime === 'server') {
      sendChatMessage(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        text: trimmed
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current) return current;
      const participant = current.participants.find(
        (item) => item.id === current.currentParticipantId
      );
      const chatMessage = createLocalChatMessage(
        current.room.id,
        current.currentParticipantId,
        (participant?.nickname ?? nickname) || '참가자',
        trimmed
      );
      const next = {
        ...current,
        chatMessages: [...current.chatMessages, chatMessage].slice(-30)
      };
      if (!current.currentGame) return next;
      return appendLocalRoomiMessage(
        next,
        'round_prompt',
        `${chatMessage.nickname}, 그 얘기에서 제일 먼저 떠오른 장면이 뭔지 하나만 더 말해줘.`
      );
    });
  };

  const submitCurrentBluffBet = (targetId: string, predictsCrack: boolean) => {
    if (!roomDraft?.currentGame || roomDraft.currentGame.kind !== 'poker_bluff') return;
    const bet: BluffBet = {
      participantId: roomDraft.currentParticipantId,
      targetId,
      predictsCrack
    };

    if (roomDraft.realtime === 'server') {
      placeBluffBet(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        gameId: roomDraft.currentGame.id,
        targetId,
        predictsCrack
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentGame || current.currentGame.kind !== 'poker_bluff') return current;
      const actor = participantNickname(current.participants, bet.participantId);
      const target = participantNickname(current.participants, targetId);
      const next: RoomDraft = {
        ...current,
        currentGame: {
          ...current.currentGame,
          status: 'guessing',
          round: { ...current.currentGame.round, status: 'guessing' },
          bluffBets: [
            ...(current.currentGame.bluffBets ?? []).filter(
              (item) => item.participantId !== bet.participantId
            ),
            bet
          ],
          updatedAt: now()
        }
      };
      return appendLocalRoomiMessage(
        next,
        'tell_hint',
        `${actor}가 ${target}에게 블러프 판정을 걸었어. 타이밍, 제스처, 보이는 표정 변화만 보자.`
      );
    });
  };

  const submitCurrentBluffSignals = (signals: ExpressionSignals) => {
    if (!roomDraft?.currentGame || roomDraft.currentGame.kind !== 'poker_bluff') return;

    if (roomDraft.realtime === 'server') {
      reportExpression(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        gameId: roomDraft.currentGame.id,
        roundId: roomDraft.currentGame.round.id,
        signals
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentGame || current.currentGame.kind !== 'poker_bluff') return current;
      const cracked =
        signals.smile >= 0.58 || signals.jawOpen >= 0.45 || signals.browRaise >= 0.5;
      const tell: BluffTell =
        signals.smile >= 0.58
          ? 'smile'
          : signals.jawOpen >= 0.45
            ? 'jaw'
            : signals.browRaise >= 0.5
              ? 'brow'
              : null;
      const targetId = current.currentParticipantId;
      const actor = participantNickname(current.participants, targetId);
      const scores = current.currentGame.scores.map((score) => {
        const matchedBet = current.currentGame?.bluffBets?.find(
          (bet) => bet.participantId === score.participantId
        );
        const betPoints = matchedBet && matchedBet.predictsCrack === cracked ? 4 : 0;
        const targetPoints = score.participantId === targetId && !cracked ? 8 : 0;
        return { ...score, points: score.points + betPoints + targetPoints };
      });

      const next: RoomDraft = {
        ...current,
        currentGame: {
          ...current.currentGame,
          bluffResult: {
            targetId,
            cracked,
            tell,
            heldMs: Math.max(0, Date.now() - signals.timestamp)
          },
          scores,
          updatedAt: now()
        }
      };
      return appendLocalRoomiMessage(
        next,
        'tell_hint',
        cracked
          ? `${actor}의 포커페이스가 ${bluffTellLabel(tell)}에서 흔들렸어.`
          : `${actor}가 포커페이스를 지켰어. +8점.`
      );
    });
  };

  const advanceCurrentRelay = (toId: string, similarity: number) => {
    if (!roomDraft?.currentGame || roomDraft.currentGame.kind !== 'copycat_relay') return;
    const link = {
      fromId: roomDraft.currentParticipantId,
      toId,
      similarity: Math.max(0, Math.min(1, similarity))
    };

    if (roomDraft.realtime === 'server') {
      advanceRelay(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        gameId: roomDraft.currentGame.id,
        link
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentGame || current.currentGame.kind !== 'copycat_relay') return current;
      const actor = participantNickname(current.participants, link.fromId);
      const target = participantNickname(current.participants, link.toId);
      const similarityPercent = Math.round(link.similarity * 100);
      const next: RoomDraft = {
        ...current,
        currentGame: {
          ...current.currentGame,
          relayLinks: [...(current.currentGame.relayLinks ?? []), link],
          scores: current.currentGame.scores.map((score) =>
            score.participantId === toId
              ? { ...score, points: score.points + Math.round(link.similarity * 10) }
              : score
          ),
          updatedAt: now()
        }
      };
      return appendLocalRoomiMessage(
        next,
        'round_prompt',
        `${actor}가 ${target}에게 릴레이를 넘겼어. 유사도는 ${similarityPercent}%야.`
      );
    });
  };

  const readyForNextRound = () => {
    if (!roomDraft?.currentGame) return;

    if (roomDraft.realtime === 'server') {
      markNextRoundReady(socketRef.current, {
        roomId: roomDraft.room.id,
        participantId: roomDraft.currentParticipantId,
        gameId: roomDraft.currentGame.id
      });
      return;
    }

    setRoomDraft((current) => {
      if (!current?.currentGame || current.currentGame.status !== 'between_round') return current;
      const readyIds = new Set(current.currentGame.nextRoundReadyParticipantIds ?? []);
      readyIds.add(current.currentParticipantId);
      const everyoneReady = current.participants.every((participant) => readyIds.has(participant.id));
      const currentGame = everyoneReady
        ? startNextLocalRound(current.room, current.participants, current.currentGame)
        : {
            ...current.currentGame,
            nextRoundReadyParticipantIds: [...readyIds],
            updatedAt: now()
          };
      return {
        ...current,
        currentGame,
        privateMission: resolvePrivateMission(current, currentGame)
      };
    });
  };

  const endCurrentSession = () => {
    if (!roomDraft) {
      go('retrospective');
      return;
    }

    if (roomDraft.realtime === 'server') {
      if (roomDraft.currentGame) {
        revealGame(socketRef.current, {
          roomId: roomDraft.room.id,
          participantId: roomDraft.currentParticipantId,
          gameId: roomDraft.currentGame.id
        });
      }
      endSession({ roomId: roomDraft.room.id, participantId: roomDraft.currentParticipantId })
        .then((snapshot) => {
          setRoomDraft((current) => (current ? { ...current, ...snapshotToDraftPatch(snapshot) } : current));
        })
        .catch((error) => console.warn(error instanceof Error ? error.message : 'Session end failed'));
      go('retrospective');
      return;
    }

    setRoomDraft((current) => {
      if (!current) return current;
      const currentGame = current.currentGame
        ? current.currentGame.status === 'reveal'
          ? current.currentGame
          : current.currentGame.status === 'between_round'
            ? {
                ...current.currentGame,
                status: 'reveal' as const,
                round: { ...current.currentGame.round, status: 'reveal' as const, revealAt: now() },
                nextRoundReadyParticipantIds: [],
                nextRoundStartsAt: undefined,
                updatedAt: now()
              }
            : finishLocalGameRound(current.currentGame, true)
        : current.currentGame;
      const next: RoomDraft = {
        ...current,
        room: { ...current.room, status: 'ended' },
        currentGame,
        currentSession: current.currentSession
          ? sessionWithLocalSummary(current.currentSession, current.goals, current.focusRanking, now())
          : current.currentSession
      };
      const winner = currentGame?.scores
        ? [...currentGame.scores].sort((left, right) => right.points - left.points)[0]
        : undefined;
      const winnerName = winner
        ? participantNickname(current.participants, winner.participantId)
        : '이번 방';
      return currentGame
        ? appendLocalRoomiMessage(
            next,
            'game_reveal',
            `${winnerName}이 이번 공개 결과에서 앞섰어. 이번 라운드 점수가 확정됐어.`
          )
        : next;
    });
    go('retrospective');
  };

  const toggleCurrentGoalAchieved = (achieved: boolean) => {
    if (!roomDraft) return;
    const participantId = roomDraft.currentParticipantId;
    if (roomDraft.realtime === 'server') {
      setGoalAchieved({ roomId: roomDraft.room.id, participantId, achieved })
        .then((snapshot) => {
          setRoomDraft((current) => (current ? { ...current, goals: snapshot.goals } : current));
        })
        .catch(() => {});
      return;
    }

    setRoomDraft((current) =>
      current
        ? {
            ...current,
            goals: current.goals.map((goal) =>
              goal.participantId === participantId ? { ...goal, achieved } : goal
            )
          }
        : current
    );
  };

  return (
    <div className="app-root">
      <WindowTitleBar />
      <main className="app-content">
        {screen === 'onboarding-nickname' && (
          <OnboardingNickname nickname={nickname} onNicknameChange={setNickname} go={go} />
        )}
        {screen === 'onboarding-create' && <OnboardingCreate nickname={nickname} go={go} />}
        {screen === 'onboarding-join' && (
          <OnboardingJoin
            code={joinCode}
            error={joinError}
            isJoining={isJoiningRoom}
            onCodeChange={(code) => {
              setJoinCode(code);
              setJoinError(undefined);
            }}
            onJoin={joinRoom}
            go={go}
          />
        )}
        {screen === 'onboarding-permission' && (
          <OnboardingPermission
            permission={mediaPermission}
            onPermissionChange={setMediaPermission}
            onReady={() => {
              if (!roomDraft) {
                setRoomDraft(joinRoomDraft(nickname || '참가자', joinCode || fallbackRoom.room.inviteCode));
              }
              go('waiting');
            }}
            onBack={() => go(isHost ? 'create-room' : 'onboarding-join')}
            go={go}
          />
        )}
        {screen === 'mediapipe-test' && <MediaPipeTest go={go} />}
        {screen === 'create-room' && (
          <CreateRoom
            error={createError}
            isCreating={isCreatingRoom}
            onCreateRoom={createRoom}
            go={go}
          />
        )}
        {screen === 'waiting' && (
          <WaitingRoom
            room={activeRoom.room}
            participants={activeRoom.participants}
            goals={activeRoom.goals}
            currentParticipantId={activeRoom.currentParticipantId}
            isHost={Boolean(isHost)}
            onSubmitGoal={submitCurrentGoal}
            onRefineGoal={refineCurrentGoal}
            onStartSession={startCurrentSession}
            onJoinSession={joinCurrentSession}
            onLeaveRoom={leaveCurrentRoom}
            go={go}
          />
        )}
        {screen === 'study' && (
          <StudyRoom
            currentParticipantId={activeRoom.currentParticipantId}
            isHost={Boolean(isHost)}
            onEndSession={endCurrentSession}
            onLeaveRoom={leaveCurrentSession}
            onToggleGoalAchieved={toggleCurrentGoalAchieved}
            participants={activeRoom.participants}
            goals={activeRoom.goals}
            roomiMessages={activeRoom.roomiMessages}
            chatMessages={activeRoom.chatMessages}
            focusRanking={activeRoom.focusRanking}
            room={activeRoom.room}
            currentSession={activeRoom.currentSession}
            currentGame={activeRoom.currentGame}
            privateMission={activeRoom.privateMission}
            videoJoin={activeRoom.videoJoin}
            onUpdatePresence={setCurrentSessionPresence}
            onStartBreak={startCurrentBreak}
            onStartGame={startCurrentGame}
            onSubmitMissionResult={submitCurrentMissionResult}
            onWinByMissionGuess={winCurrentRoundByMissionGuess}
            onSubmitBluffBet={submitCurrentBluffBet}
            onSubmitBluffSignals={submitCurrentBluffSignals}
            onAdvanceRelay={advanceCurrentRelay}
            onReadyNextRound={readyForNextRound}
            onSendChatMessage={submitCurrentChatMessage}
            go={go}
          />
        )}
        {screen === 'break' && (
          <BreakReturn
            room={activeRoom.room}
            currentSession={activeRoom.currentSession}
            isHost={Boolean(isHost)}
            onReturnToStudy={endCurrentBreak}
            onExtendBreak={extendCurrentBreak}
            go={go}
          />
        )}
        {screen === 'retrospective' && (
          <Retrospective
            session={activeRoom.currentSession}
            currentGame={activeRoom.currentGame}
            focusRanking={activeRoom.focusRanking}
            goals={activeRoom.goals}
            onHome={returnHome}
            participants={activeRoom.participants}
            currentParticipantId={activeRoom.currentParticipantId}
            go={go}
          />
        )}
      </main>
    </div>
  );
}

function snapshotToDraftPatch(snapshot: {
  room: Room;
  participants: Participant[];
  goals: Goal[];
  roomiMessages: RoomiMessage[];
  currentSession?: StudySession;
  currentGame?: GameSession;
}) {
  return {
    room: snapshot.room,
    participants: snapshot.participants,
    goals: snapshot.goals,
    roomiMessages: snapshot.roomiMessages,
    currentSession: snapshot.currentSession,
    currentGame: snapshot.currentGame
  };
}

function buildRetrospectiveDraft(
  draft: RoomDraft,
  currentParticipantStatus: ParticipantStatus
): RoomDraft {
  const timestamp = now();
  const participants = draft.participants.map((participant) =>
    participant.id === draft.currentParticipantId
      ? { ...participant, status: currentParticipantStatus, lastSeenAt: timestamp }
      : participant
  );

  return {
    ...draft,
    participants,
    currentSession: draft.currentSession
      ? sessionWithLocalSummary(draft.currentSession, draft.goals, draft.focusRanking, timestamp)
      : draft.currentSession
  };
}

function sessionWithLocalSummary(
  session: StudySession,
  goals: Goal[],
  ranking: FocusRankingEntry[],
  endedAt: string
): StudySession {
  const focusMinutes =
    session.summary?.focusMinutes ??
    averageFocusMinutes(ranking) ??
    elapsedSessionMinutes(session, endedAt);
  const achievedGoals = goals.filter((goal) => goal.achieved).length;
  const goalCompletionRate =
    session.summary?.goalCompletionRate ?? (goals.length > 0 ? achievedGoals / goals.length : 0);

  return {
    ...session,
    endedAt: session.endedAt ?? endedAt,
    mode: 'ended',
    summary: {
      ...session.summary,
      focusMinutes,
      goalCompletionRate,
      ranking: session.summary?.ranking ?? ranking
    }
  };
}

function averageFocusMinutes(ranking: FocusRankingEntry[]) {
  if (ranking.length === 0) return undefined;
  return Math.round(
    ranking.reduce((total, entry) => total + entry.focusMinutes, 0) / ranking.length
  );
}

function elapsedSessionMinutes(session: StudySession, endedAt: string) {
  const elapsedMinutes = Math.max(
    0,
    (Date.parse(endedAt) - Date.parse(session.startedAt)) / 60_000
  );
  return Math.round(Math.min(elapsedMinutes, session.plannedMinutes));
}

function finishLocalGameRound(game: GameSession, forceReveal = false): GameSession {
  const timestamp = now();
  const scores =
    game.kind === 'hidden_mission'
      ? game.scores.map((score) => {
          const result = (game.missionResults ?? []).find(
            (result) => result.playerId === score.participantId
          );
          const mission = game.missions?.find(
            (mission) => mission.playerId === score.participantId
          );
          return { ...score, points: score.points + hiddenMissionRoundPoints(result, mission) };
        })
      : game.scores;
  const completedRounds = [
    ...(game.completedRounds ?? []),
    {
      roundIndex: game.round.index,
      status: forceReveal || game.round.index >= game.totalRounds ? 'revealed' as const : 'completed' as const,
      endedAt: timestamp,
      scores,
      missionResults: game.missionResults,
      bluffResult: game.bluffResult,
      relayLinks: game.relayLinks
    }
  ];

  if (forceReveal || game.round.index >= game.totalRounds) {
    return {
      ...game,
      status: 'reveal',
      round: { ...game.round, status: 'reveal', revealAt: timestamp },
      scores,
      completedRounds,
      nextRoundReadyParticipantIds: [],
      nextRoundStartsAt: undefined,
      updatedAt: timestamp
    };
  }

  const nextRoundStartsAt = new Date(Date.now() + 5 * 60_000).toISOString();
  return {
    ...game,
    status: 'between_round',
    round: { ...game.round, status: 'between_round', revealAt: timestamp, nextStartsAt: nextRoundStartsAt },
    scores,
    completedRounds,
    nextRoundReadyParticipantIds: [],
    nextRoundStartsAt,
    updatedAt: timestamp
  };
}

function finishLocalGameRoundWithWinner(game: GameSession, winnerId: string): GameSession {
  const timestamp = now();
  const scores = game.scores.map((score) => ({
    ...score,
    points: score.points + (score.participantId === winnerId ? 10 : 0)
  }));
  const completedRounds = [
    ...(game.completedRounds ?? []),
    {
      roundIndex: game.round.index,
      status: game.round.index >= game.totalRounds ? 'revealed' as const : 'completed' as const,
      endedAt: timestamp,
      scores,
      missionResults: game.missionResults,
      bluffResult: game.bluffResult,
      relayLinks: game.relayLinks
    }
  ];

  if (game.round.index >= game.totalRounds) {
    return {
      ...game,
      status: 'reveal',
      round: { ...game.round, status: 'reveal', revealAt: timestamp },
      scores,
      completedRounds,
      nextRoundReadyParticipantIds: [],
      nextRoundStartsAt: undefined,
      updatedAt: timestamp
    };
  }

  const nextRoundStartsAt = new Date(Date.now() + 5 * 60_000).toISOString();
  return {
    ...game,
    status: 'between_round',
    round: { ...game.round, status: 'between_round', revealAt: timestamp, nextStartsAt: nextRoundStartsAt },
    scores,
    completedRounds,
    nextRoundReadyParticipantIds: [],
    nextRoundStartsAt,
    updatedAt: timestamp
  };
}

function startNextLocalRound(room: Room, participants: Participant[], game: GameSession): GameSession {
  const freshGame = createLocalGame(room, participants, game.kind, game.missions);
  const timestamp = now();
  return {
    ...game,
    status: 'in_round',
    round: {
      id: `round-${Date.now()}`,
      gameId: game.id,
      index: game.round.index + 1,
      status: 'in_round',
      startedAt: timestamp,
      endsAt: new Date(Date.now() + 90_000).toISOString()
    },
    missions: game.kind === 'hidden_mission' ? freshGame.missions : [],
    missionResults: [],
    bluffBets: game.kind === 'poker_bluff' ? [] : undefined,
    bluffResult: undefined,
    relayLinks: game.kind === 'copycat_relay' ? [] : undefined,
    nextRoundReadyParticipantIds: [],
    nextRoundStartsAt: undefined,
    updatedAt: timestamp
  };
}

function createLocalRoomiMessage(
  roomId: string,
  kind: RoomiMessage['kind'],
  text: string
): RoomiMessage {
  return {
    id: `roomi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    kind,
    text,
    createdAt: now()
  };
}

function createLocalChatMessage(
  roomId: string,
  participantId: string,
  nickname: string,
  text: string
): ChatMessage {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    participantId,
    nickname,
    text,
    createdAt: now()
  };
}

function appendLocalRoomiMessage(
  draft: RoomDraft,
  kind: RoomiMessage['kind'],
  text: string
): RoomDraft {
  return {
    ...draft,
    roomiMessages: [
      ...draft.roomiMessages,
      createLocalRoomiMessage(draft.room.id, kind, text)
    ].slice(-LOCAL_ROOMI_MESSAGE_LIMIT)
  };
}

function participantNickname(participants: Participant[], participantId: string) {
  return participants.find((participant) => participant.id === participantId)?.nickname ?? '참가자';
}

function bluffTellLabel(tell: BluffTell): string {
  if (tell === 'smile') return '미소';
  if (tell === 'jaw') return '입 벌림';
  if (tell === 'brow') return '눈썹 움직임';
  return '보이는 신호';
}

function gameLabel(kind: GameKind) {
  if (kind === 'hidden_mission') return '숨은 표정 미션';
  if (kind === 'poker_bluff') return '포커페이스 블러프';
  return '카피캣 릴레이';
}

function localGameIntroMessage(kind: GameKind, roundNumber: number, playStyles: string[]) {
  const styles =
    playStyles.length > 0 ? ` 오늘의 플레이 스타일도 살려볼게: ${playStyles.join(', ')}.` : '';
  if (kind === 'hidden_mission') {
    const topic = hiddenMissionConversationTopic(roundNumber);
    return `숨은 표정 미션 ${roundNumber}라운드. 대화 주제는 "${topic}"이야. 이 얘기를 자연스럽게 이어가면서 각자 비밀 미션은 티 안 나게 섞어보자.${styles}`;
  }
  return `${gameLabel(kind)} 시작! 눈에 보이는 표정과 움직임만 보고 가볍게 반응해보자.${styles}`;
}

function hiddenMissionConversationTopic(roundNumber: number) {
  const topics = [
    '요즘 애매하게 웃겼던 일',
    '친구가 보면 바로 놀릴 만한 작은 습관',
    '최근에 괜히 기억에 남은 장면',
    '처음엔 별거 아닌데 말하다 보니 길어지는 이야기',
    '하루만 바꿔보고 싶은 사소한 규칙'
  ];
  return topics[(Math.max(1, roundNumber) - 1) % topics.length]!;
}

function hiddenMissionRoundPoints(
  result: MissionResult | undefined,
  mission: HiddenMission | undefined
) {
  if (!result || !mission || mission.target <= 0) return 0;
  return Math.round((Math.min(result.count, mission.target) / mission.target) * 10);
}

function localPlayStyleFallback(kind: GameKind, rawStyle: string) {
  const trimmed = rawStyle.trim();
  if (trimmed) return trimmed;
  if (kind === 'hidden_mission') return '들키면 더 억울해하는 비밀 요원처럼 굴기';
  if (kind === 'poker_bluff') return '의심받을수록 더 침착한 척하기';
  return '디테일 하나를 집요하게 따라 하는 카피 장인 되기';
}

type PrivateMissionContext = Pick<
  RoomDraft,
  'currentParticipantId' | 'currentGame' | 'privateMission'
>;

export function resolvePrivateMission(
  current: PrivateMissionContext,
  game: GameSession | undefined
) {
  const assignedMission = game?.missions?.find(
    (mission) => mission.playerId === current.currentParticipantId
  );

  if (assignedMission) return assignedMission;
  if (
    game?.kind === 'hidden_mission' &&
    current.currentGame?.id === game.id &&
    current.currentGame.round.id === game.round.id
  ) {
    return current.privateMission;
  }

  return undefined;
}
