import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExpressionSignals,
  GameSession,
  HiddenMission,
  Participant,
  Room
} from '@roomi/shared';
import {
  DailyParticipantMedia,
  focusLabelToParticipantStatus,
  formatSessionTime,
  participantStatusLabel,
  participantsInStudyRoom,
  reconcilePendingCameraState,
  setDailyCameraEnabled,
  shouldUseLocalCameraFallback,
  remainingSessionSeconds,
  StudyRoom
} from './StudyRoom';

const focusDetectionMock = vi.hoisted(() => ({
  snapshot: {
    status: 'running',
    error: null,
    focusSnapshot: {
      label: 'focused',
      score: 100,
      activeSignals: [],
      durations: { face_missing: 0, eyes_closed: 0, head_turned: 0, head_down: 0 },
      current: {
        facePresent: true,
        eyeAspectRatio: 0.3,
        headYawRatio: 0,
        headPitchRatio: 0,
        eyesClosed: false,
        headTurned: false,
        headDown: false
      }
    },
    detectionSnapshot: { faces: 1, landmarks: 468, fps: 30, lastUpdatedAt: '10:00:00' },
    mlPrediction: null,
    mlStatus: 'idle',
    mlError: null,
    expressionSignals: null as ExpressionSignals | null
  }
}));

vi.mock('../../use-focus-detection', () => ({
  useFocusDetection: () => focusDetectionMock.snapshot
}));

beforeEach(() => {
  vi.restoreAllMocks();
  focusDetectionMock.snapshot.expressionSignals = null;
  focusDetectionMock.snapshot.focusSnapshot = {
    label: 'focused',
    score: 100,
    activeSignals: [],
    durations: { face_missing: 0, eyes_closed: 0, head_turned: 0, head_down: 0 },
    current: {
      facePresent: true,
      eyeAspectRatio: 0.3,
      headYawRatio: 0,
      headPitchRatio: 0,
      eyesClosed: false,
      headTurned: false,
      headDown: false
    }
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StudyRoom session clock', () => {
  it('shows only participants who actually entered the study room', () => {
    const participant = (id: string, status: 'online' | 'focused') => ({
      id,
      roomId: 'room-1',
      userId: `user-${id}`,
      nickname: id,
      role: 'member' as const,
      status,
      isReady: false,
      scoreVisible: true,
      joinedAt: '2026-07-13T00:00:00.000Z',
      lastSeenAt: '2026-07-13T00:00:00.000Z'
    });

    expect(
      participantsInStudyRoom([participant('waiting', 'online'), participant('studying', 'focused')])
    ).toMatchObject([{ id: 'studying' }]);
  });

  it('derives the remaining time from the server session start time', () => {
    const startedAt = '2026-07-13T00:00:00.000Z';
    const timestamp = Date.parse(startedAt) + 12 * 60_000 + 18_400;

    expect(
      remainingSessionSeconds(
        { id: 'session-1', roomId: 'room-1', startedAt, plannedMinutes: 50, mode: 'study' },
        timestamp
      )
    ).toBe(2_262);
    expect(formatSessionTime(2_262)).toBe('37:42');
  });

  it('does not show a negative duration after the session ends', () => {
    expect(
      remainingSessionSeconds(
        {
          id: 'session-1',
          roomId: 'room-1',
          startedAt: '2026-07-13T00:00:00.000Z',
          plannedMinutes: 1,
          mode: 'study'
        },
        Date.parse('2026-07-13T00:02:00.000Z')
      )
    ).toBe(0);
  });
});

describe('StudyRoom focus detection status mapping', () => {
  it('maps MediaPipe and ML labels to session presence statuses', () => {
    expect(focusLabelToParticipantStatus('focused')).toBe('focused');
    expect(focusLabelToParticipantStatus('distracted')).toBe('distracted');
    expect(focusLabelToParticipantStatus('uncertain')).toBe('distracted');
    expect(focusLabelToParticipantStatus('away')).toBe('away');
    expect(focusLabelToParticipantStatus('sleepy')).toBe('paused');
    expect(focusLabelToParticipantStatus('paused')).toBe('paused');
  });

  it('shows detailed MediaPipe-derived labels for the local participant', () => {
    const participant = createParticipant('participant-host', 'Host');
    const current = {
      facePresent: true,
      eyeAspectRatio: 0.3,
      headYawRatio: 0,
      headPitchRatio: 0,
      headPose: null,
      mouthAspectRatio: 0.1,
      eyesClosed: false,
      headTurned: false,
      headDown: false,
      mouthOpen: false
    };

    expect(
      participantStatusLabel(participant, {
        label: 'away',
        activeSignals: ['face_missing'],
        current: { ...current, facePresent: false }
      })
    ).toBe('얼굴 없음');
    expect(
      participantStatusLabel(participant, {
        label: 'sleepy',
        activeSignals: ['eyes_closed'],
        current
      })
    ).toBe('눈 감김');
    expect(
      participantStatusLabel(participant, {
        label: 'distracted',
        activeSignals: ['head_down'],
        current
      })
    ).toBe('고개 숙임');
    expect(
      participantStatusLabel(participant, {
        label: 'uncertain',
        activeSignals: ['head_turned'],
        current
      })
    ).toBe('시선 이탈');
  });
});

describe('DailyParticipantMedia', () => {
  it('keeps the requested camera state until Daily reports the change', () => {
    expect(reconcilePendingCameraState(false, true)).toEqual({ cameraOn: true, pending: true });
    expect(reconcilePendingCameraState(true, true)).toEqual({ cameraOn: true, pending: undefined });
  });

  it('restarts the Daily call instead of reusing a stopped track when camera is enabled', () => {
    const setLocalVideo = vi.fn();
    const restart = vi.fn();

    setDailyCameraEnabled(false, { setLocalVideo }, restart);
    setDailyCameraEnabled(true, { setLocalVideo }, restart);

    expect(setLocalVideo).toHaveBeenCalledTimes(1);
    expect(setLocalVideo).toHaveBeenCalledWith(false);
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('uses a local camera fallback while Daily has not exposed a local video track', () => {
    const videoJoin = {
      provider: 'daily' as const,
      roomUrl: 'https://roomi.daily.co/test',
      token: 'token'
    };
    const dailyTrack = { id: 'daily-track' } as unknown as MediaStreamTrack;

    expect(shouldUseLocalCameraFallback(videoJoin, true, null)).toBe(true);
    expect(shouldUseLocalCameraFallback(videoJoin, false, null)).toBe(true);
    expect(shouldUseLocalCameraFallback(videoJoin, true, dailyTrack)).toBe(false);
    expect(shouldUseLocalCameraFallback(undefined, true, null)).toBe(true);
  });

  it('attaches the new playable Daily video track after camera recovery', async () => {
    const stream = { id: 'stream-1' };
    const MediaStreamMock = vi.fn(() => stream);
    vi.stubGlobal('MediaStream', MediaStreamMock);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const staleVideoTrack = { id: 'stale-video-track' } as unknown as MediaStreamTrack;
    const videoTrack = { id: 'video-track-1' } as unknown as MediaStreamTrack;
    const participant = {
      tracks: {
        video: { state: 'playable', track: staleVideoTrack }
      }
    };

    const { rerender } = render(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn
        isMe
        participant={participant}
      />
    );
    const firstVideo = screen.getByLabelText('내 웹캠 미리보기') as HTMLVideoElement;
    await waitFor(() => expect(firstVideo.srcObject).toBe(stream));

    rerender(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn={false}
        isMe
        participant={participant}
      />
    );
    expect(screen.getByText('나')).toBeInTheDocument();

    rerender(
      <DailyParticipantMedia
        fallbackInitial="나"
        isCameraOn
        isMe
        participant={{ tracks: { video: { state: 'playable', track: videoTrack } } }}
      />
    );
    const secondVideo = screen.getByLabelText('내 웹캠 미리보기') as HTMLVideoElement;
    await waitFor(() => expect(secondVideo.srcObject).toBe(stream));
    expect(MediaStreamMock).toHaveBeenCalledWith([videoTrack]);
  });
});

describe('StudyRoom hidden mission progress', () => {
  it('shows break control only in study mode', () => {
    const participant = createParticipant('participant-host', 'Host');
    const onStartBreak = vi.fn();

    const { rerender } = render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
        onStartBreak={onStartBreak}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '휴식 시작' }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);

    rerender(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'hidden_mission')}
        onStartBreak={onStartBreak}
      />
    );

    expect(screen.queryByRole('button', { name: '휴식 시작' })).not.toBeInTheDocument();
  });

  it('starts the room-configured game mode', () => {
    const participant = createParticipant('participant-host', 'Host');
    const onStartGame = vi.fn();
    const room = createRoom('poker_bluff');

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={room}
        onStartGame={onStartGame}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '포커페이스 블러프 시작' }));

    expect(onStartGame).toHaveBeenCalledWith('poker_bluff');
  });

  it('shows game ended in the top round field after the final reveal', () => {
    const participant = createParticipant('participant-host', 'Host');
    const room = createRoom();
    const currentGame: GameSession = {
      ...createGame(room, [participant], 'hidden_mission'),
      status: 'reveal',
      round: {
        ...createGame(room, [participant], 'hidden_mission').round,
        status: 'reveal',
        revealAt: '2026-07-15T00:02:00.000Z'
      }
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={room}
        currentGame={currentGame}
      />
    );

    expect(screen.getByText('게임 종료')).toBeInTheDocument();
  });

  it('increments the secret mission count when expression signals cross the mission threshold', async () => {
    const participant = createParticipant('participant-host', 'Host');
    const room = createRoom();
    const privateMission: HiddenMission = {
      id: 'mission-1',
      playerId: participant.id,
      prompt: 'Smile twice',
      verify: 'smile_count',
      target: 2
    };
    const currentGame: GameSession = {
      id: 'game-1',
      roomId: room.id,
      kind: 'hidden_mission',
      status: 'in_round',
      round: {
        id: 'round-1',
        gameId: 'game-1',
        index: 1,
        status: 'in_round',
        startedAt: '2026-07-15T00:00:00.000Z',
        endsAt: '2026-07-15T00:02:00.000Z'
      },
      totalRounds: room.settings.roundCount,
      completedRounds: [],
      nextRoundReadyParticipantIds: [],
      scores: [{ participantId: participant.id, points: 0 }],
      missions: [privateMission],
      missionResults: [],
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    };
    const props = {
      currentParticipantId: participant.id,
      isHost: true,
      onEndSession: vi.fn(),
      onLeaveRoom: vi.fn(),
      onToggleGoalAchieved: vi.fn(),
      onUpdatePresence: vi.fn(),
      onStartBreak: vi.fn(),
      onStartGame: vi.fn(),
      onSubmitMissionResult: vi.fn(),
      participants: [participant],
      goals: [],
      roomiMessages: [],
      chatMessages: [],
      room,
      currentGame,
      privateMission,
      go: vi.fn()
    };

    const { rerender } = render(<StudyRoom {...props} />);
    expect(screen.getByText(/진행: 0\/2/)).toBeInTheDocument();

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 1_000, smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/진행: 1\/2/)).toBeInTheDocument());
    await waitFor(() =>
      expect(props.onSubmitMissionResult).toHaveBeenCalledWith({
        playerId: participant.id,
        missionId: privateMission.id,
        count: 1,
        success: false
      })
    );

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 1_100, smile: 0.1 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/진행: 1\/2/)).toBeInTheDocument());

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 2_100, smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/진행: 2\/2/)).toBeInTheDocument());
    await waitFor(() =>
      expect(props.onSubmitMissionResult).toHaveBeenCalledWith({
        playerId: participant.id,
        missionId: privateMission.id,
        count: 2,
        success: true
      })
    );
  });

  it('locks hidden mission progress until the distraction card is solved', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const host = createParticipant('participant-host', 'Host');
    const room = createRoom();
    const privateMission: HiddenMission = {
      id: 'mission-1',
      playerId: host.id,
      prompt: 'Smile once',
      verify: 'smile_count',
      target: 1
    };
    const currentGame: GameSession = {
      ...createGame(room, [host], 'hidden_mission'),
      missions: [privateMission]
    };
    const onSubmitMissionResult = vi.fn();

    const { rerender } = render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host]}
        privateMission={privateMission}
        room={room}
        onSubmitMissionResult={onSubmitMissionResult}
      />
    );

    expect(screen.queryByLabelText('루미 방해 카드')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.queryByLabelText('루미 방해 카드')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByLabelText('루미 방해 카드')).toBeInTheDocument();
    expect(screen.getByText('방해 카드를 풀어야 미션이 다시 진행돼요.')).toBeInTheDocument();
    vi.useRealTimers();

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 1_000, smile: 0.8 });
    rerender(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host]}
        privateMission={privateMission}
        room={room}
        onSubmitMissionResult={onSubmitMissionResult}
      />
    );

    expect(screen.getByText(/진행: 0\/1/)).toBeInTheDocument();
    expect(onSubmitMissionResult).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /화상 타일 보기/ }));
    expect(screen.queryByLabelText('루미 방해 카드')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /방해 카드 보기/ }));
    fireEvent.click(screen.getByRole('button', { name: '7' }));

    await waitFor(() =>
      expect(onSubmitMissionResult).toHaveBeenCalledWith({
        playerId: host.id,
        missionId: privateMission.id,
        count: 1,
        success: true
      })
    );
  });

  it('resets the secret mission count when the round changes even if the mission id is reused', async () => {
    const participant = createParticipant('participant-host', 'Host');
    const room = createRoom();
    const privateMission: HiddenMission = {
      id: 'mission-1',
      playerId: participant.id,
      prompt: 'Smile twice',
      verify: 'smile_count',
      target: 2
    };
    const currentGame: GameSession = {
      id: 'game-1',
      roomId: room.id,
      kind: 'hidden_mission',
      status: 'in_round',
      round: {
        id: 'round-1',
        gameId: 'game-1',
        index: 1,
        status: 'in_round',
        startedAt: '2026-07-15T00:00:00.000Z',
        endsAt: '2026-07-15T00:02:00.000Z'
      },
      totalRounds: room.settings.roundCount,
      completedRounds: [],
      nextRoundReadyParticipantIds: [],
      scores: [{ participantId: participant.id, points: 0 }],
      missions: [privateMission],
      missionResults: [],
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    };
    const props = {
      currentParticipantId: participant.id,
      isHost: true,
      onEndSession: vi.fn(),
      onLeaveRoom: vi.fn(),
      onToggleGoalAchieved: vi.fn(),
      onUpdatePresence: vi.fn(),
      onStartBreak: vi.fn(),
      onStartGame: vi.fn(),
      onSubmitMissionResult: vi.fn(),
      participants: [participant],
      goals: [],
      roomiMessages: [],
      chatMessages: [],
      room,
      currentGame,
      privateMission,
      go: vi.fn()
    };

    const { rerender } = render(<StudyRoom {...props} />);
    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 1_000, smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() =>
      expect(
        screen.getAllByText((_text, node) => node?.textContent === 'Smile twice진행: 1/2').length
      ).toBeGreaterThan(0)
    );

    focusDetectionMock.snapshot.expressionSignals = null;
    rerender(
      <StudyRoom
        {...props}
        currentGame={{
          ...currentGame,
          round: {
            ...currentGame.round,
            id: 'round-2',
            index: 2
          },
          missionResults: []
        }}
      />
    );

    await waitFor(() =>
      expect(
        screen.getAllByText((_text, node) => node?.textContent === 'Smile twice진행: 0/2').length
      ).toBeGreaterThan(0)
    );
  });

  it('does not submit a fresh round mission with the previous round counter', async () => {
    const participant = createParticipant('participant-host', 'Host');
    const room = createRoom('hidden_mission', 'hidden_mission');
    const firstMission: HiddenMission = {
      id: 'mission-1',
      playerId: participant.id,
      prompt: 'Smile once',
      verify: 'smile_count',
      target: 1
    };
    const secondMission: HiddenMission = {
      ...firstMission,
      id: 'mission-2',
      prompt: 'Wink once',
      verify: 'wink_count'
    };
    const currentGame: GameSession = {
      id: 'game-1',
      roomId: room.id,
      kind: 'hidden_mission',
      status: 'in_round',
      round: {
        id: 'round-1',
        gameId: 'game-1',
        index: 1,
        status: 'in_round',
        startedAt: '2026-07-15T00:00:00.000Z',
        endsAt: '2026-07-15T00:02:00.000Z'
      },
      totalRounds: room.settings.roundCount,
      completedRounds: [],
      nextRoundReadyParticipantIds: [],
      scores: [{ participantId: participant.id, points: 0 }],
      missions: [firstMission],
      missionResults: [],
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    };
    const props = {
      currentParticipantId: participant.id,
      isHost: true,
      onEndSession: vi.fn(),
      onLeaveRoom: vi.fn(),
      onToggleGoalAchieved: vi.fn(),
      onUpdatePresence: vi.fn(),
      onStartBreak: vi.fn(),
      onStartGame: vi.fn(),
      onSubmitMissionResult: vi.fn(),
      participants: [participant],
      goals: [],
      roomiMessages: [],
      chatMessages: [],
      room,
      currentGame,
      privateMission: firstMission,
      go: vi.fn()
    };

    const { rerender } = render(<StudyRoom {...props} />);
    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ timestamp: 1_000, smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() =>
      expect(props.onSubmitMissionResult).toHaveBeenCalledWith({
        playerId: participant.id,
        missionId: firstMission.id,
        count: 1,
        success: true
      })
    );

    focusDetectionMock.snapshot.expressionSignals = null;
    rerender(
      <StudyRoom
        {...props}
        currentGame={{
          ...currentGame,
          round: { ...currentGame.round, id: 'round-2', index: 2 },
          missions: [secondMission],
          missionResults: []
        }}
        privateMission={secondMission}
      />
    );

    await waitFor(() => expect(props.onSubmitMissionResult).toHaveBeenCalledTimes(1));
  });

  it('shows every participant goal in study mode', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        room={createRoom('hidden_mission', 'study')}
        participants={[host, member]}
        goals={[
          {
            id: 'goal-host',
            roomId: 'room-1',
            participantId: host.id,
            rawText: '수학 문제 10개',
            createdAt: '2026-07-15T00:00:00.000Z'
          },
          {
            id: 'goal-member',
            roomId: 'room-1',
            participantId: member.id,
            rawText: '영어 단어 50개',
            createdAt: '2026-07-15T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: '공부 목표' })).toBeInTheDocument();
    expect(screen.getByText('수학 문제 10개')).toBeInTheDocument();
    expect(screen.getByText('영어 단어 50개')).toBeInTheDocument();
  });

  it('shows every participant play style before a game starts', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        room={createRoom('poker_bluff', 'poker_bluff')}
        participants={[host, member]}
        goals={[
          {
            id: 'style-host',
            roomId: 'room-1',
            participantId: host.id,
            rawText: '의심받을수록 더 침착한 척하기',
            createdAt: '2026-07-15T00:00:00.000Z'
          },
          {
            id: 'style-member',
            roomId: 'room-1',
            participantId: member.id,
            rawText: '괜히 자신감 넘치는 분석가처럼 말하기',
            createdAt: '2026-07-15T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: '현재 순위' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '자세히 보기' }));
    expect(screen.getByRole('heading', { name: '게임 결과 상세' })).toBeInTheDocument();
    expect(screen.getByText('의심받을수록 더 침착한 척하기')).toBeInTheDocument();
    expect(screen.getByText('괜히 자신감 넘치는 분석가처럼 말하기')).toBeInTheDocument();
    expect(screen.getByText(/포커페이스 블러프를 시작하면/)).toBeInTheDocument();
  });

  it('submits poker bluff bets and expression checks from the game controls', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };
    const onSubmitBluffBet = vi.fn();
    const onSubmitBluffSignals = vi.fn();
    const currentGame = createGame(createRoom(), [host, member], 'poker_bluff');
    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ smile: 0.9 });

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host, member]}
        onSubmitBluffBet={onSubmitBluffBet}
        onSubmitBluffSignals={onSubmitBluffSignals}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '흔들릴 것 같아요' }));
    fireEvent.click(screen.getByRole('button', { name: '표정 판정 보내기' }));

    expect(onSubmitBluffBet).toHaveBeenCalledWith(member.id, true);
    expect(onSubmitBluffSignals).toHaveBeenCalledWith(
      expect.objectContaining({ smile: 0.9 })
    );
  });

  it('shows the latest round winner while waiting for the next round', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };
    const room = createRoom('hidden_mission', 'hidden_mission');
    const currentGame: GameSession = {
      ...createGame(room, [host, member], 'hidden_mission'),
      status: 'between_round',
      round: {
        id: 'round-1',
        gameId: 'game-hidden_mission',
        index: 1,
        status: 'between_round',
        startedAt: '2026-07-15T00:00:00.000Z',
        revealAt: '2026-07-15T00:01:00.000Z',
        nextStartsAt: new Date(Date.now() + 60_000).toISOString()
      },
      completedRounds: [
        {
          roundIndex: 1,
          status: 'completed',
          endedAt: '2026-07-15T00:01:00.000Z',
          scores: [
            { participantId: host.id, points: 5 },
            { participantId: member.id, points: 10 }
          ]
        }
      ],
      nextRoundStartsAt: new Date(Date.now() + 60_000).toISOString(),
      nextRoundReadyParticipantIds: [host.id],
      scores: [
        { participantId: host.id, points: 5 },
        { participantId: member.id, points: 10 }
      ]
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        room={room}
        currentGame={currentGame}
        participants={[host, member]}
      />
    );

    expect(screen.getByText('1라운드 Member 우승')).toHaveClass('study-timer__round-winner');
    expect(screen.getByText(/2라운드 시작까지/)).toBeInTheDocument();
    expect(screen.getByText('준비 대기 중')).toBeInTheDocument();
  });

  it('submits copycat relay links with the selected target and similarity', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };
    const onAdvanceRelay = vi.fn();
    const currentGame = createGame(createRoom(), [host, member], 'copycat_relay');

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host, member]}
        onAdvanceRelay={onAdvanceRelay}
      />
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '82' } });
    fireEvent.click(screen.getByRole('button', { name: '릴레이 넘기기' }));

    expect(onAdvanceRelay).toHaveBeenCalledWith(member.id, 0.82);
  });
});

function baseStudyRoomProps(participant: Participant) {
  return {
    currentParticipantId: participant.id,
    isHost: true,
    onEndSession: vi.fn(),
    onLeaveRoom: vi.fn(),
    onToggleGoalAchieved: vi.fn(),
    onUpdatePresence: vi.fn(),
    onStartBreak: vi.fn(),
    onStartGame: vi.fn(),
    onSubmitMissionResult: vi.fn(),
    participants: [participant],
    goals: [],
    roomiMessages: [],
    chatMessages: [],
    room: createRoom(),
    go: vi.fn()
  };
}

function createRoom(
  defaultGameKind: Room['settings']['defaultGameKind'] = 'hidden_mission',
  activityKind: Room['settings']['activityKind'] = defaultGameKind
): Room {
  return {
    id: 'room-1',
    inviteCode: 'ABC123',
    hostUserId: 'user-host',
    settings: {
      activityKind,
      defaultGameKind,
      sessionMinutes: 10,
      roundCount: 3,
      breakMinutes: 5,
      maxParticipants: 4,
      breakMode: 'individual',
      defaultScoreVisibility: 'private',
      detectionPauseAllowed: true,
      authMode: 'nickname_code',
      videoProvider: 'daily',
      roomiTone: 'friendly_casual',
      rankingMetric: 'focus_minutes',
      videoRequired: true
    },
    status: 'studying',
    createdAt: '2026-07-15T00:00:00.000Z'
  };
}

function createParticipant(id: string, nickname: string): Participant {
  return {
    id,
    roomId: 'room-1',
    userId: `user-${id}`,
    nickname,
    role: 'host',
    status: 'focused',
    isReady: true,
    scoreVisible: true,
    joinedAt: '2026-07-15T00:00:00.000Z',
    lastSeenAt: '2026-07-15T00:00:00.000Z'
  };
}

function createGame(room: Room, participants: Participant[], kind: GameSession['kind']): GameSession {
  return {
    id: `game-${kind}`,
    roomId: room.id,
    kind,
    status: 'in_round',
    round: {
      id: `round-${kind}`,
      gameId: `game-${kind}`,
      index: 1,
      status: 'in_round',
      startedAt: '2026-07-15T00:00:00.000Z',
      endsAt: '2026-07-15T00:02:00.000Z'
    },
    totalRounds: room.settings.roundCount,
    completedRounds: [],
    nextRoundReadyParticipantIds: [],
    scores: participants.map((participant) => ({ participantId: participant.id, points: 0 })),
    missions: [],
    missionResults: [],
    bluffBets: kind === 'poker_bluff' ? [] : undefined,
    relayLinks: kind === 'copycat_relay' ? [] : undefined,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  };
}

function expressionSignal(overrides: Partial<ExpressionSignals>): ExpressionSignals {
  return {
    timestamp: Date.now(),
    smile: 0,
    jawOpen: 0,
    winkLeft: false,
    winkRight: false,
    browRaise: 0,
    cheekPuff: 0,
    mouthPucker: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    ...overrides
  };
}
