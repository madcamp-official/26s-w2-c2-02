import { useEffect, useRef, useState } from 'react';
import {
  createInviteCode,
  normalizeInviteCode,
  type Goal,
  type Participant,
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
  createRoomSession,
  createRoomSocket,
  endSession,
  joinRoomSession,
  leaveRoom,
  refineGoal,
  RoomApiError,
  setGoalAchieved,
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
  realtime: 'local' | 'server';
  videoJoin?: VideoJoinInfo;
};

const now = () => new Date().toISOString();

const defaultRoomSettings: RoomSettings = {
  sessionMinutes: 50,
  breakMode: 'room',
  defaultScoreVisibility: 'public',
  maxParticipants: 4,
  authMode: 'nickname_code',
  videoProvider: 'daily',
  roomiTone: 'friendly_casual',
  rankingMetric: 'focus_minutes',
  videoRequired: true,
  detectionPauseAllowed: true
};

const fallbackRoom: RoomDraft = {
  currentParticipantId: 'participant-demo',
  realtime: 'local',
  room: {
    id: 'room-demo',
    inviteCode: '7KQ2MD',
    hostUserId: 'user-demo',
    settings: defaultRoomSettings,
    status: 'waiting',
    createdAt: now()
  },
  participants: [
    {
      id: 'participant-demo',
      roomId: 'room-demo',
      userId: 'user-demo',
      nickname: '소요',
      role: 'host',
      status: 'online',
      isReady: false,
      scoreVisible: true,
      joinedAt: now(),
      lastSeenAt: now()
    },
    {
      id: 'participant-chae',
      roomId: 'room-demo',
      userId: 'user-chae',
      nickname: '채훈',
      role: 'member',
      status: 'online',
      isReady: false,
      scoreVisible: true,
      joinedAt: now(),
      lastSeenAt: now()
    },
    {
      id: 'participant-min',
      roomId: 'room-demo',
      userId: 'user-min',
      nickname: '민지',
      role: 'member',
      status: 'online',
      isReady: false,
      scoreVisible: true,
      joinedAt: now(),
      lastSeenAt: now()
    }
  ],
  goals: [],
  roomiMessages: []
};

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
      {
        id: participantId,
        roomId,
        userId,
        nickname,
        role: 'host',
        status: 'online',
        isReady: false,
        scoreVisible: settings.defaultScoreVisibility === 'public',
        joinedAt: timestamp,
        lastSeenAt: timestamp
      }
    ],
    goals: [],
    roomiMessages: []
  };
}

function joinRoomDraft(nickname: string, inviteCode: string): RoomDraft {
  const timestamp = now();
  const roomId = `room-${inviteCode}`;
  const userId = `user-${Date.now()}`;
  const participantId = `participant-${Date.now()}`;

  return {
    currentParticipantId: participantId,
    realtime: 'local',
    room: {
      ...fallbackRoom.room,
      id: roomId,
      inviteCode,
      hostUserId: 'user-host',
      createdAt: timestamp
    },
    participants: [
      {
        id: 'participant-host',
        roomId,
        userId: 'user-host',
        nickname: '방장',
        role: 'host',
        status: 'online',
        isReady: false,
        scoreVisible: true,
        joinedAt: timestamp,
        lastSeenAt: timestamp
      },
      {
        id: participantId,
        roomId,
        userId,
        nickname,
        role: 'member',
        status: 'online',
        isReady: false,
        scoreVisible: true,
        joinedAt: timestamp,
        lastSeenAt: timestamp
      }
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
    videoJoin: session.videoJoin
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
    if (!roomDraft || roomDraft.realtime !== 'server') {
      return undefined;
    }

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
                currentSession: snapshot.currentSession
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
      (message) => {
        console.warn(`Room realtime error: ${message}`);
      }
    );
  }, [roomDraft?.room.id, roomDraft?.realtime]);

  // An ended room is never joinable. This also covers a participant who receives
  // the terminal snapshot while they are already in the waiting or study screen.
  useEffect(() => {
    if (activeRoom.room.status === 'ended' && screen !== 'retrospective') {
      go('retrospective');
    }
  }, [screen, activeRoom.room.status]);

  useEffect(() => {
    if (createError) setIsCreatingRoom(false);
  }, [createError]);

  useEffect(() => {
    if (joinError) setIsJoiningRoom(false);
  }, [joinError]);

  useEffect(() => {
    if (screen === 'onboarding-permission') {
      resetRoomRequestState();
    }
  }, [screen]);

  const createRoom = async (settings: RoomSettings) => {
    if (createRoomLockRef.current) return;
    createRoomLockRef.current = true;
    setIsCreatingRoom(true);
    const input = { nickname: nickname || '나', settings };
    setCreateError(undefined);

    try {
      const session = await createRoomSession(input);
      setRoomDraft(roomSessionToDraft(session));
    } catch (error) {
      if (error instanceof RoomApiError) {
        createRoomLockRef.current = false;
        setCreateError('방을 만들지 못했어요. API 서버와 Daily 설정을 확인해주세요.');
        return;
      }

      createRoomLockRef.current = false;
      setCreateError('서버에 연결하지 못했어요. API 서버가 실행 중인지 확인해 주세요.');
      return;
    }

    resetRoomRequestState();
    go(mediaPermission === 'granted' ? 'waiting' : 'onboarding-permission');
  };

  const joinRoom = async () => {
    if (joinRoomLockRef.current) return;
    joinRoomLockRef.current = true;
    setIsJoiningRoom(true);
    const input = { nickname: nickname || '나', inviteCode: normalizeInviteCode(joinCode) };
    setJoinError(undefined);

    try {
      const session = await joinRoomSession(input);
      setRoomDraft(roomSessionToDraft(session));
    } catch (error) {
      if (error instanceof RoomApiError) {
        joinRoomLockRef.current = false;
      joinRoomLockRef.current = false;
      setJoinError(
          error.status === 409
            ? '방이 가득 찼어요. 방장에게 새 방을 요청해주세요.'
            : error.status === 503
              ? '화상 세션을 준비하지 못했어요. 잠시 후 다시 시도해주세요.'
            : '방 코드를 찾지 못했어요. 코드를 다시 확인해주세요.'
        );
        return;
      }

      setJoinError('서버에 연결하지 못했어요. API 서버가 실행 중인지 확인해주세요.');
      return;
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
    refineGoal({ rawGoal, sessionMinutes: activeRoom.room.settings.sessionMinutes });

  const startCurrentSession = async () => {
    if (!roomDraft) return;

    if (roomDraft.realtime === 'server') {
      try {
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
                currentSession: snapshot.currentSession
              }
            : current
        );
        go('study');
        return;
      } catch (error) {
        throw error;
      }
    }

    setRoomDraft((current) =>
      current
        ? {
            ...current,
            room: { ...current.room, status: 'studying' },
            participants: current.participants.map((participant) =>
              participant.id === current.currentParticipantId
                ? { ...participant, status: 'focused' }
                : participant
            ),
            currentSession: {
              id: `session-${Date.now()}`,
              roomId: current.room.id,
              startedAt: now(),
              plannedMinutes: current.room.settings.sessionMinutes,
              mode: 'study'
            }
          }
        : current
    );
    go('study');
  };

  const setCurrentSessionPresence = (status: 'online' | 'focused') => {
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

  const endCurrentSession = () => {
    if (!roomDraft) {
      go('retrospective');
      return;
    }

    if (roomDraft.realtime === 'server') {
      // Navigate immediately; the summary (goal feedback, Lumi's comment) streams in
      // once the request resolves so the host isn't stuck waiting on the network.
      endSession({ roomId: roomDraft.room.id, participantId: roomDraft.currentParticipantId })
        .then((snapshot) => {
          setRoomDraft((current) =>
            current
              ? {
                  ...current,
                  room: snapshot.room,
                  participants: snapshot.participants,
                  goals: snapshot.goals,
                  roomiMessages: snapshot.roomiMessages,
                  currentSession: snapshot.currentSession
                }
              : current
          );
        })
        .catch((error) => {
          console.warn(error instanceof Error ? error.message : 'Session end failed');
        });
      go('retrospective');
      return;
    }

    setRoomDraft((current) =>
      current
        ? {
            ...current,
            room: { ...current.room, status: 'ended' },
            currentSession: current.currentSession
              ? { ...current.currentSession, endedAt: now(), mode: 'ended' }
              : current.currentSession
          }
        : current
    );
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
                setRoomDraft(joinRoomDraft(nickname || '나', joinCode || fallbackRoom.room.inviteCode));
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
            isHost={isHost}
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
            isHost={isHost}
            onEndSession={endCurrentSession}
            onLeaveRoom={leaveCurrentSession}
            onToggleGoalAchieved={toggleCurrentGoalAchieved}
            participants={activeRoom.participants}
            goals={activeRoom.goals}
            roomiMessages={activeRoom.roomiMessages}
            room={activeRoom.room}
            currentSession={activeRoom.currentSession}
            videoJoin={activeRoom.videoJoin}
            go={go}
          />
        )}
        {screen === 'break' && <BreakReturn go={go} />}
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
