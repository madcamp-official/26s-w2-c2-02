import { useEffect, useRef, useState } from 'react';
import {
  createInviteCode,
  normalizeInviteCode,
  type BluffBet,
  type ExpressionSignals,
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
  placeBluffBet,
  refineGoal,
  reportExpression,
  revealGame,
  RoomApiError,
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
  currentSession?: StudySession;
  currentGame?: GameSession;
  privateMission?: HiddenMission;
  realtime: 'local' | 'server';
  videoJoin?: VideoJoinInfo;
};

const now = () => new Date().toISOString();

const defaultRoomSettings: RoomSettings = {
  sessionMinutes: 50,
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

const fallbackRoom: RoomDraft = createRoomDraft('Player', defaultRoomSettings);

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
    roomiMessages: []
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
    roomiMessages: []
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
    currentSession: session.snapshot.currentSession,
    currentGame: session.snapshot.currentGame,
    privateMission: session.snapshot.currentGame?.missions?.find(
      (mission) => mission.playerId === session.currentParticipantId
    ),
    videoJoin: session.videoJoin
  };
}

function createLocalGame(room: Room, participants: Participant[], kind: GameKind): GameSession {
  const timestamp = now();
  const gameId = `game-${Date.now()}`;
  const templates: Array<Omit<HiddenMission, 'id' | 'playerId'>> = [
    { prompt: 'Wink 3 times without being obvious', verify: 'wink_count', target: 3 },
    { prompt: 'Smile naturally 4 times', verify: 'smile_count', target: 4 },
    { prompt: 'Do not open your mouth wide this round', verify: 'no_jaw_open', target: 0 },
    { prompt: 'Raise your brows 5 times', verify: 'brow_count', target: 5 }
  ];

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
      endsAt: new Date(Date.now() + room.settings.sessionMinutes * 60_000).toISOString()
    },
    scores: participants.map((participant) => ({
      participantId: participant.id,
      points: 0
    })),
    missions:
      kind === 'hidden_mission'
        ? participants.map((participant, index) => ({
            id: `mission-${participant.id}`,
            playerId: participant.id,
            ...templates[index % templates.length]!
          }))
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
      (message) => console.warn(`Room realtime error: ${message}`)
    );
  }, [roomDraft?.room.id, roomDraft?.realtime]);

  useEffect(() => {
    if (activeRoom.room.status === 'ended' && screen !== 'retrospective') go('retrospective');
  }, [activeRoom.room.status, screen]);

  useEffect(() => {
    if (activeRoom.room.status === 'break' && screen === 'study') {
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
  }, [activeRoom.room.settings.breakMode, activeRoom.room.status, screen]);

  const createRoom = async (settings: RoomSettings) => {
    if (createRoomLockRef.current) return;
    createRoomLockRef.current = true;
    setIsCreatingRoom(true);
    const input = { nickname: nickname || 'Player', settings };
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
    const input = { nickname: nickname || 'Player', inviteCode: normalizeInviteCode(joinCode) };
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

  const refineCurrentGoal = (rawGoal: string) =>
    refineGoal({ rawGoal, sessionMinutes: activeRoom.room.settings.sessionMinutes }).catch(() => ({
      refinedText: rawGoal,
      reason: 'Local fallback while the API is unavailable.',
      source: 'template' as const
    }));

  const startCurrentGame = (kind: GameKind = 'hidden_mission') => {
    if (!roomDraft) return;

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
      return {
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
    setCurrentSessionPresence('focused');
    go('study');
  };

  const leaveCurrentSession = () => {
    setCurrentSessionPresence('online');
    go('waiting');
  };

  const startCurrentBreak = async () => {
    if (!roomDraft) return;
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
    if (!roomDraft || roomDraft.room.settings.breakMode !== 'room' || !isHost) return;
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

    setRoomDraft((current) =>
      current?.currentGame?.kind === 'poker_bluff'
        ? {
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
          }
        : current
    );
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
      const tell =
        signals.smile >= 0.58
          ? 'smile'
          : signals.jawOpen >= 0.45
            ? 'jaw'
            : signals.browRaise >= 0.5
              ? 'brow'
              : null;
      const targetId = current.currentParticipantId;
      const scores = current.currentGame.scores.map((score) => {
        const matchedBet = current.currentGame?.bluffBets?.find(
          (bet) => bet.participantId === score.participantId
        );
        const betPoints = matchedBet && matchedBet.predictsCrack === cracked ? 4 : 0;
        const targetPoints = score.participantId === targetId && !cracked ? 8 : 0;
        return { ...score, points: score.points + betPoints + targetPoints };
      });

      return {
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

    setRoomDraft((current) =>
      current?.currentGame?.kind === 'copycat_relay'
        ? {
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
          }
        : current
    );
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
      const results = current.currentGame?.missionResults ?? [];
      const currentGame = current.currentGame
        ? {
            ...current.currentGame,
            status: 'reveal' as const,
            round: { ...current.currentGame.round, status: 'reveal' as const, revealAt: now() },
            scores: current.currentGame.scores.map((score) => {
              const success = results.find((result) => result.playerId === score.participantId)?.success;
              return { ...score, points: score.points + (success ? 10 : 0) };
            })
          }
        : current.currentGame;
      return {
        ...current,
        room: { ...current.room, status: 'ended' },
        currentGame,
        currentSession: current.currentSession
          ? { ...current.currentSession, endedAt: now(), mode: 'ended' }
          : current.currentSession
      };
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
                setRoomDraft(joinRoomDraft(nickname || 'Player', joinCode || fallbackRoom.room.inviteCode));
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
            room={activeRoom.room}
            currentSession={activeRoom.currentSession}
            currentGame={activeRoom.currentGame}
            privateMission={activeRoom.privateMission}
            videoJoin={activeRoom.videoJoin}
            onUpdatePresence={setCurrentSessionPresence}
            onStartBreak={startCurrentBreak}
            onStartGame={startCurrentGame}
            onSubmitMissionResult={submitCurrentMissionResult}
            onSubmitBluffBet={submitCurrentBluffBet}
            onSubmitBluffSignals={submitCurrentBluffSignals}
            onAdvanceRelay={advanceCurrentRelay}
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
            goals={activeRoom.goals}
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

function resolvePrivateMission(current: RoomDraft, game: GameSession | undefined) {
  const assignedMission = game?.missions?.find(
    (mission) => mission.playerId === current.currentParticipantId
  );

  if (assignedMission) return assignedMission;
  if (game?.kind === 'hidden_mission' && current.currentGame?.id === game.id) {
    return current.privateMission;
  }

  return undefined;
}
