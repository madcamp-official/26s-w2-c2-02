import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    focusSnapshot: { label: 'focused' },
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
      room,
      currentGame,
      privateMission,
      go: vi.fn()
    };

    const { rerender } = render(<StudyRoom {...props} />);
    expect(screen.getByText(/Count: 0\/2/)).toBeInTheDocument();

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/Count: 1\/2/)).toBeInTheDocument());

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ smile: 0.1 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/Count: 1\/2/)).toBeInTheDocument());

    focusDetectionMock.snapshot.expressionSignals = expressionSignal({ smile: 0.8 });
    rerender(<StudyRoom {...props} />);
    await waitFor(() => expect(screen.getByText(/Count: 2\/2/)).toBeInTheDocument());
    expect(props.onSubmitMissionResult).toHaveBeenCalledWith({
      playerId: participant.id,
      missionId: privateMission.id,
      count: 2,
      success: true
    });
  });
});

function createRoom(): Room {
  return {
    id: 'room-1',
    inviteCode: 'ABC123',
    hostUserId: 'user-host',
    settings: {
      sessionMinutes: 10,
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
