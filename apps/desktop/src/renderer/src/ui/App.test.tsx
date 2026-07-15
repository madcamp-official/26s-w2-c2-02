import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInviteCode,
  formatInviteCode,
  inviteCodeAlphabet,
  normalizeInviteCode,
  type GameSession,
  type HiddenMission
} from '@roomi/shared';
import { App, resolvePrivateMission } from './App';

const socketMock = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  on: vi.fn()
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketMock)
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.values(socketMock).forEach((mock) => mock.mockClear());
});

describe('App screen router', () => {
  it('keeps generated invite codes complete after normalization and formatting', () => {
    const code = createInviteCode(() => 11 / 31);

    expect(code).toHaveLength(6);
    expect(normalizeInviteCode(code)).toHaveLength(6);
    expect(formatInviteCode(code)).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    inviteCodeAlphabet.split('').forEach((character) => {
      expect(normalizeInviteCode(character)).toBe(character);
    });
  });

  it('starts on the nickname onboarding screen', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: '어떻게 부르면 될까요?' })
    ).toBeInTheDocument();
  });

  it('continues from nickname onboarding when pressing enter', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.submit(screen.getByRole('button', { name: '다음' }).closest('form')!);

    expect(screen.getByText(/소요님/)).toBeInTheDocument();
  });

  it('opens the MediaPipe rule-based focus test screen from onboarding', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /MediaPipe 집중도 테스트/ }));

    expect(screen.getByRole('heading', { level: 1, name: '집중도 판정 모드 테스트' })).toBeInTheDocument();
    expect(screen.getByLabelText('현재 집중도 판정')).toHaveTextContent('대기');
    expect(screen.getByLabelText('집중도 판정 모드')).toHaveTextContent('Rule-Based');
    expect(screen.getByLabelText('집중도 판정 모드')).toHaveTextContent('ML 서버');

    fireEvent.click(screen.getByRole('button', { name: '기준 조정' }));
    expect(screen.getByRole('dialog', { name: 'Rule-Based 기준 조정' })).toBeInTheDocument();
  });

  it('creates a server room after nickname, room settings, and media permission', async () => {
    const audioTrack = { stop: vi.fn() };
    const videoTrack = { stop: vi.fn() };
    const stream = {
      getTracks: () => [audioTrack, videoTrack]
    } as unknown as MediaStream;

    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia
      }
    });
    stubHostApi();
    vi.spyOn(Math, 'random').mockReturnValue(0.2345);

    render(<App />);

    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText(/소요님/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));

    expect(screen.queryByText('생성 후 발급')).not.toBeInTheDocument();
    expect(screen.queryByText('초대 코드')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '25분' }));
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '카메라와 마이크를 확인할게요' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '권한 확인하고 입장' }));

    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    expect(screen.getByText('HHH-HHH')).toBeInTheDocument();
    expect(screen.getAllByText('소요').length).toBeGreaterThan(0);
    // Readiness now reflects the isReady flag, and a freshly created host is not ready yet.
    expect(screen.getByText('0명이 준비를 마쳤어요.')).toBeInTheDocument();
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(videoTrack.stop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '방 나가기' }));
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));

    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    expect(screen.queryByText('카메라와 마이크를 확인할게요')).not.toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '방 나가기' }));
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));
    expect(screen.getByRole('button', { name: '방 만들고 대기실로 가기' })).toBeEnabled();
  });

  it('keeps session end behind host-only actions', async () => {
    const audioTrack = { enabled: true, stop: vi.fn() };
    const videoTrack = { enabled: true, stop: vi.fn() };
    const stream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
      getTracks: () => [audioTrack, videoTrack]
    } as unknown as MediaStream;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      }
    });
    stubHostApi();
    vi.spyOn(Math, 'random').mockReturnValue(0.2345);

    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '소요' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /새로운 방 만들기/ }));
    fireEvent.click(screen.getByRole('button', { name: '방 만들고 대기실로 가기' }));
    fireEvent.click(await screen.findByRole('button', { name: '권한 확인하고 입장' }));
    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    fireEvent.change(screen.getByLabelText('내 목표'), { target: { value: '수학 3단원' } });
    fireEvent.blur(screen.getByLabelText('내 목표'));
    fireEvent.click(screen.getByRole('button', { name: '세션 시작하기' }));
    await screen.findByLabelText('내 웹캠 미리보기');
    expect(screen.getByText('소요 (나)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '집중 확인' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '마이크 끄기' }));
    expect(audioTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '마이크 켜기' }));
    expect(audioTrack.enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '카메라 끄기' }));
    expect(videoTrack.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '카메라 켜기' }));
    expect(videoTrack.enabled).toBe(true);
    expect(screen.getByLabelText('내 웹캠 미리보기')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '방장 메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '세션 종료' }));
    expect(screen.getByRole('dialog', { name: '세션 종료 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '세션 종료' }));

    expect(
      screen.getByRole('heading', { level: 1, name: '오늘 세션, 잘 마쳤어요!' })
    ).toBeInTheDocument();
  });

  it('does not show host actions for users who join by room code', async () => {
    const stream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;
    const timestamp = new Date().toISOString();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream)
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          currentParticipantId: 'participant-minji',
          snapshot: {
            room: {
              id: 'room-server',
              inviteCode: '7KQ2MD',
              hostUserId: 'user-host',
              settings: defaultTestRoomSettings(),
              status: 'waiting',
              createdAt: timestamp
            },
            participants: [
              {
                id: 'participant-host',
                roomId: 'room-server',
                userId: 'user-host',
                nickname: '소요',
                role: 'host',
                status: 'online',
                isReady: false,
                scoreVisible: true,
                joinedAt: timestamp,
                lastSeenAt: timestamp
              },
              {
                id: 'participant-minji',
                roomId: 'room-server',
                userId: 'user-minji',
                nickname: '민지',
                role: 'member',
                status: 'online',
                isReady: false,
                scoreVisible: true,
                joinedAt: timestamp,
                lastSeenAt: timestamp
              }
            ],
            goals: [],
            roomiMessages: [],
            chatMessages: []
          }
        })
      })
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '민지' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /방 코드로 입장하기/ }));
    fireEvent.change(screen.getByLabelText('방 코드'), { target: { value: '7KQ2MD' } });
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }));
    fireEvent.click(await screen.findByRole('button', { name: '권한 확인하고 입장' }));
    await screen.findByRole('heading', { level: 1, name: '다 같이 목표를 정해볼까요?' });
    // Members have no start button; they stay in the lobby until they explicitly
    // join after the server broadcasts the studying snapshot over room:updated.
    expect(screen.queryByRole('button', { name: '세션 시작하기' })).not.toBeInTheDocument();

    const onUpdated = socketMock.on.mock.calls.find(
      ([event]) => event === 'room:updated'
    )?.[1] as (snapshot: unknown) => void;
    const studyingSnapshot = {
      room: {
        id: 'room-server',
        inviteCode: '7KQ2MD',
        hostUserId: 'user-host',
        settings: defaultTestRoomSettings(),
        status: 'studying',
        createdAt: timestamp
      },
      participants: [
        { id: 'participant-host', roomId: 'room-server', userId: 'user-host', nickname: '소요', role: 'host', status: 'online', isReady: true, scoreVisible: true, joinedAt: timestamp, lastSeenAt: timestamp },
        { id: 'participant-minji', roomId: 'room-server', userId: 'user-minji', nickname: '민지', role: 'member', status: 'online', isReady: false, scoreVisible: true, joinedAt: timestamp, lastSeenAt: timestamp }
      ],
      goals: [
        { id: 'goal-minji', roomId: 'room-server', participantId: 'participant-minji', rawText: '영어 단어 100개', createdAt: timestamp }
      ],
      roomiMessages: [],
      chatMessages: [],
      currentSession: {
        id: 'session-1',
        roomId: 'room-server',
        startedAt: timestamp,
        plannedMinutes: 50,
        mode: 'study'
      }
    };
    act(() => onUpdated(studyingSnapshot));

    expect(await screen.findByRole('heading', { level: 1, name: '이미 공부 중이에요' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '스터디룸 참여하기' }));
    expect(socketMock.emit).toHaveBeenCalledWith('participant:update-status', {
      roomId: 'room-server',
      participantId: 'participant-minji',
      status: 'focused'
    });
    await screen.findByLabelText('내 웹캠 미리보기');
    expect(screen.getAllByText('소요').length).toBeGreaterThan(0);
    expect(screen.getByText('민지 (나)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '방장 메뉴' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    expect(socketMock.emit).toHaveBeenCalledWith('participant:update-status', {
      roomId: 'room-server',
      participantId: 'participant-minji',
      status: 'online'
    });
    expect(await screen.findByRole('heading', { level: 1, name: '이미 공부 중이에요' })).toBeInTheDocument();
    expect(socketMock.emit).not.toHaveBeenCalledWith('room:leave', {
      roomId: 'room-server',
      participantId: 'participant-minji'
    });

    fireEvent.click(screen.getByRole('button', { name: '방 나가기' }));
    expect(socketMock.emit).toHaveBeenCalledWith('room:leave', {
      roomId: 'room-server',
      participantId: 'participant-minji'
    });
    expect(screen.getByText(/민지님/)).toBeInTheDocument();
  });

  it('routes an ended room to the retrospective instead of the waiting room', async () => {
    const timestamp = new Date().toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          currentParticipantId: 'participant-minji',
          snapshot: {
            room: {
              id: 'room-ended',
              inviteCode: '7KQ2MD',
              hostUserId: 'user-host',
              settings: defaultTestRoomSettings(),
              status: 'ended',
              createdAt: timestamp
            },
            participants: [],
            goals: [],
            roomiMessages: [],
            chatMessages: []
          }
        })
      })
    );

    render(<App />);
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '민지' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: /방 코드로 입장하기/ }));
    fireEvent.change(screen.getByLabelText('방 코드'), { target: { value: '7KQ2MD' } });
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: '오늘 세션, 잘 마쳤어요!' })
    ).toBeInTheDocument();
    expect(screen.queryByText('다 같이 목표를 정해볼까요?')).not.toBeInTheDocument();
  });
});

describe('resolvePrivateMission', () => {
  it('drops the previous private mission when a public next-round game arrives first', () => {
    const previousMission = hiddenMission('mission-1', 'participant-host', 'Smile twice');
    const previousGame = hiddenMissionGame('round-1', [previousMission]);
    const publicNextRound = {
      ...previousGame,
      status: 'in_round' as const,
      round: {
        ...previousGame.round,
        id: 'round-2',
        index: 2
      },
      missions: []
    };

    expect(
      resolvePrivateMission(
        {
          currentParticipantId: 'participant-host',
          currentGame: previousGame,
          privateMission: previousMission
        },
        publicNextRound
      )
    ).toBeUndefined();
  });

  it('keeps the current private mission for public updates within the same round', () => {
    const mission = hiddenMission('mission-1', 'participant-host', 'Smile twice');
    const game = hiddenMissionGame('round-1', [mission]);

    expect(
      resolvePrivateMission(
        {
          currentParticipantId: 'participant-host',
          currentGame: game,
          privateMission: mission
        },
        { ...game, missions: [] }
      )
    ).toBe(mission);
  });

  it('uses a newly assigned private mission from participant-specific snapshots', () => {
    const previousMission = hiddenMission('mission-1', 'participant-host', 'Smile twice');
    const nextMission = hiddenMission('mission-2', 'participant-host', 'Wink twice');
    const previousGame = hiddenMissionGame('round-1', [previousMission]);
    const nextGame = hiddenMissionGame('round-2', [nextMission]);

    expect(
      resolvePrivateMission(
        {
          currentParticipantId: 'participant-host',
          currentGame: previousGame,
          privateMission: previousMission
        },
        nextGame
      )
    ).toBe(nextMission);
  });
});

function defaultTestRoomSettings() {
  return {
    activityKind: 'study',
    authMode: 'nickname_code',
    breakMode: 'room',
    breakMinutes: 10,
    defaultGameKind: 'hidden_mission',
    defaultScoreVisibility: 'public',
    detectionPauseAllowed: true,
    maxParticipants: 4,
    rankingMetric: 'focus_minutes',
    roomiTone: 'friendly_casual',
    sessionMinutes: 50,
    roundCount: 3,
    videoProvider: 'daily',
    videoRequired: true
  };
}

function stubHostApi() {
  const timestamp = new Date().toISOString();
  const room = {
    id: 'room-host',
    inviteCode: 'HHHHHH',
    hostUserId: 'user-host',
    settings: defaultTestRoomSettings(),
    status: 'waiting' as const,
    createdAt: timestamp
  };
  const participant = {
    id: 'participant-host',
    roomId: room.id,
    userId: room.hostUserId,
    nickname: '소요',
    role: 'host' as const,
    status: 'online' as const,
    isReady: false,
    scoreVisible: true,
    joinedAt: timestamp,
    lastSeenAt: timestamp
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const snapshot = url.endsWith('/sessions')
        ? {
            room: { ...room, status: 'studying' as const },
            participants: [{ ...participant, status: 'focused' as const }],
            goals: [],
            roomiMessages: [],
            chatMessages: [],
            currentSession: {
              id: 'session-host',
              roomId: room.id,
              startedAt: timestamp,
              plannedMinutes: room.settings.sessionMinutes,
              mode: 'study' as const
            }
          }
        : { room, participants: [participant], goals: [], roomiMessages: [], chatMessages: [] };

      return {
        ok: true,
        json: async () =>
          url.endsWith('/rooms')
            ? { currentParticipantId: participant.id, snapshot }
            : snapshot
      };
    })
  );
}

function hiddenMission(id: string, playerId: string, prompt: string): HiddenMission {
  return {
    id,
    playerId,
    prompt,
    verify: 'smile_count',
    target: 2
  };
}

function hiddenMissionGame(roundId: string, missions: HiddenMission[]): GameSession {
  return {
    id: 'game-1',
    roomId: 'room-1',
    kind: 'hidden_mission',
    status: 'in_round',
    round: {
      id: roundId,
      gameId: 'game-1',
      index: Number(roundId.replace('round-', '')) || 1,
      status: 'in_round',
      startedAt: '2026-07-15T00:00:00.000Z',
      endsAt: '2026-07-15T00:01:30.000Z'
    },
    totalRounds: 3,
    completedRounds: [],
    nextRoundReadyParticipantIds: [],
    scores: [{ participantId: 'participant-host', points: 0 }],
    missions,
    missionResults: [],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  };
}
