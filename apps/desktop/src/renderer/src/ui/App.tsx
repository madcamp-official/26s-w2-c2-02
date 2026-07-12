import { useState } from 'react';
import type { Participant, Room, RoomSettings } from '@roomi/shared';
import { WindowTitleBar } from './components/WindowTitleBar';
import { OnboardingNickname } from './screens/OnboardingNickname';
import { OnboardingCreate } from './screens/OnboardingCreate';
import { OnboardingJoin } from './screens/OnboardingJoin';
import { OnboardingPermission } from './screens/OnboardingPermission';
import { CreateRoom } from './screens/CreateRoom';
import { WaitingRoom } from './screens/WaitingRoom';
import { StudyRoom } from './screens/StudyRoom';
import { BreakReturn } from './screens/BreakReturn';
import { Retrospective } from './screens/Retrospective';
import type { ScreenId } from './screens/types';

type MediaPermissionState = 'idle' | 'checking' | 'granted' | 'denied';

type RoomDraft = {
  currentParticipantId: string;
  room: Room;
  participants: Participant[];
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
  room: {
    id: 'room-demo',
    inviteCode: '4821',
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
      scoreVisible: true,
      joinedAt: now(),
      lastSeenAt: now()
    }
  ]
};

function createRoomDraft(nickname: string, settings: RoomSettings): RoomDraft {
  const timestamp = now();
  const roomId = `room-${Date.now()}`;
  const userId = `user-${Date.now()}`;
  const participantId = `participant-${Date.now()}`;

  return {
    currentParticipantId: participantId,
    room: {
      id: roomId,
      inviteCode: String(Math.floor(1000 + Math.random() * 9000)),
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
        scoreVisible: settings.defaultScoreVisibility === 'public',
        joinedAt: timestamp,
        lastSeenAt: timestamp
      }
    ]
  };
}

function joinRoomDraft(nickname: string, inviteCode: string): RoomDraft {
  const timestamp = now();
  const roomId = `room-${inviteCode}`;
  const userId = `user-${Date.now()}`;
  const participantId = `participant-${Date.now()}`;

  return {
    currentParticipantId: participantId,
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
        scoreVisible: true,
        joinedAt: timestamp,
        lastSeenAt: timestamp
      }
    ]
  };
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>('onboarding-nickname');
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mediaPermission, setMediaPermission] = useState<MediaPermissionState>('idle');
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null);
  const go = (id: ScreenId) => setScreen(id);
  const activeRoom = roomDraft ?? fallbackRoom;
  const currentParticipant = activeRoom.participants.find(
    (participant) => participant.id === activeRoom.currentParticipantId
  );
  const isHost = currentParticipant?.role === 'host';

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
            onCodeChange={setJoinCode}
            onJoin={() => {
              setRoomDraft(joinRoomDraft(nickname || '나', joinCode));
              go('onboarding-permission');
            }}
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
            go={go}
          />
        )}
        {screen === 'create-room' && (
          <CreateRoom
            inviteCode={activeRoom.room.inviteCode}
            onCreateRoom={(settings) => {
              setRoomDraft(createRoomDraft(nickname || '나', settings));
              go('onboarding-permission');
            }}
            go={go}
          />
        )}
        {screen === 'waiting' && (
          <WaitingRoom room={activeRoom.room} participants={activeRoom.participants} go={go} />
        )}
        {screen === 'study' && (
          <StudyRoom
            isHost={isHost}
            onEndSession={() => go('retrospective')}
            room={activeRoom.room}
            go={go}
          />
        )}
        {screen === 'break' && <BreakReturn go={go} />}
        {screen === 'retrospective' && <Retrospective go={go} />}
      </main>
    </div>
  );
}
