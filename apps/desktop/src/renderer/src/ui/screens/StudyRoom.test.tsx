import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExpressionSignals,
  GameSession,
  HiddenMission,
  Participant,
  Room
} from '@roomi/shared';
import type { FocusSnapshot } from '../../focus-pipeline';
import { focusIndices } from '../../focus-stats';
import {
  DailyParticipantMedia,
  createDistractionCardByKind,
  FocusDetailPanel,
  focusLabelToParticipantStatus,
  focusScoreTrendPoints,
  focusStatusFromSignals,
  focusVerdictLabel,
  formatSessionTime,
  participantStatusLabel,
  participantsInStudyRoom,
  reconcilePendingCameraState,
  ruleSettingsForActivity,
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
      activeSignals: [] as FocusSnapshot['activeSignals'],
      durations: {
        face_missing: 0,
        eyes_closed: 0,
        head_turned: 0,
        head_down: 0,
        yawning: 0,
        gaze_diverged: 0
      },
      blinksPerMinute: 0,
      yawnCount: 0,
      motionAmount: 0,
      current: {
        facePresent: true,
        eyeAspectRatio: 0.3,
        headYawRatio: 0,
        headPitchRatio: 0,
        headPose: null,
        gazeDivergence: 0,
        mouthAspectRatio: 0.1,
        eyesClosed: false,
        headTurned: false,
        headDown: false,
        mouthOpen: false,
        gazeDiverged: false
      } as FocusSnapshot['current']
    },
    // An unstarted session: every rate reads zero and the detail panel stays on
    // its "not enough observed yet" copy.
    sessionStats: {
      startedAt: 0,
      updatedAt: 0,
      faceFrames: 0,
      eyesClosedFrames: 0,
      blinks: 0,
      yawns: 0,
      headTurns: 0,
      headDowns: 0,
      aways: 0,
      gazeDiversions: 0,
      motionSum: 0,
      motionSamples: 0,
      previousSignals: [],
      previousEyesClosed: false
    },
    detectionSnapshot: { faces: 1, landmarks: 478, fps: 30, lastUpdatedAt: '10:00:00' },
    mlPrediction: null,
    mlStatus: 'idle',
    mlError: null,
    expressionSignals: null as ExpressionSignals | null
  }
}));

vi.mock('../../use-focus-detection', () => ({
  useFocusDetection: () => focusDetectionMock.snapshot
}));

/**
 * A frame of someone facing the screen with nothing firing. Kept in one place so
 * a new signal on FrameSignals fails typecheck here once, not at every call site.
 */
function attentiveFrame(
  overrides: Partial<FocusSnapshot['current']> = {}
): FocusSnapshot['current'] {
  return {
    facePresent: true,
    eyeAspectRatio: 0.3,
    headYawRatio: 0,
    headPitchRatio: 0,
    headPose: null,
    gazeDivergence: 0,
    mouthAspectRatio: 0.1,
    eyesClosed: false,
    headTurned: false,
    headDown: false,
    mouthOpen: false,
    gazeDiverged: false,
    ...overrides
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  focusDetectionMock.snapshot.expressionSignals = null;
  focusDetectionMock.snapshot.sessionStats = {
    startedAt: 0,
    updatedAt: 0,
    faceFrames: 0,
    eyesClosedFrames: 0,
    blinks: 0,
    yawns: 0,
    headTurns: 0,
    headDowns: 0,
    aways: 0,
    gazeDiversions: 0,
    motionSum: 0,
    motionSamples: 0,
    previousSignals: [],
    previousEyesClosed: false
  };
  focusDetectionMock.snapshot.focusSnapshot = {
    label: 'focused',
    score: 100,
    activeSignals: [],
    durations: {
      face_missing: 0,
      eyes_closed: 0,
      head_turned: 0,
      head_down: 0,
      yawning: 0,
      gaze_diverged: 0
    },
    blinksPerMinute: 0,
    yawnCount: 0,
    motionAmount: 0,
    current: attentiveFrame()
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

describe('focusScoreTrendPoints', () => {
  it('draws nothing until there are two samples to connect', () => {
    expect(focusScoreTrendPoints([], 240, 48)).toBe('');
    expect(focusScoreTrendPoints([120], 240, 48)).toBe('');
  });

  it('puts the highest score at the top and the lowest at the bottom', () => {
    // y grows downward in SVG, so the best score sits at y=0.
    expect(focusScoreTrendPoints([0, 100], 240, 48)).toBe('0,48 240,0');
  });

  it('draws a flat run down the middle instead of dividing by zero', () => {
    expect(focusScoreTrendPoints([50, 50, 50], 240, 48)).toBe('0,24 120,24 240,24');
  });

  it('shows a drop as a fall toward the bottom edge', () => {
    const points = focusScoreTrendPoints([100, 50, 0], 240, 48);

    expect(points).toBe('0,0 120,24 240,48');
  });
});

describe('ruleSettingsForActivity', () => {
  it('gives study rooms the full grace period before calling someone away', () => {
    // Focus time stops accruing while a participant is away, so a blip in
    // detection must not cost them credit for studying.
    expect(ruleSettingsForActivity('study').faceMissingSeconds).toBe(5);
  });

  it('marks a hidden face as away immediately in the face games', () => {
    expect(ruleSettingsForActivity('hidden_mission').faceMissingSeconds).toBe(0);
    expect(ruleSettingsForActivity('poker_bluff').faceMissingSeconds).toBe(0);
    expect(ruleSettingsForActivity('copycat_relay').faceMissingSeconds).toBe(0);
  });

  it('changes nothing else between the two modes', () => {
    const { faceMissingSeconds: _study, ...study } = ruleSettingsForActivity('study');
    const { faceMissingSeconds: _game, ...game } = ruleSettingsForActivity('hidden_mission');

    expect(study).toEqual(game);
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

  it('uses high session-level distraction as a distracted presence signal', () => {
    expect(focusStatusFromSignals('focused', { ready: false, distraction: 100 })).toBe('focused');
    expect(focusStatusFromSignals('focused', { ready: true, distraction: 69 })).toBe('focused');
    expect(focusStatusFromSignals('focused', { ready: true, distraction: 70 })).toBe('distracted');
    expect(focusStatusFromSignals('away', { ready: true, distraction: 0 })).toBe('away');
  });

  it('reacts to head signals on the current frame, without waiting for a sustained run', () => {
    const participant = createParticipant('participant-host', 'Host');
    const current = attentiveFrame();

    // activeSignals is empty: the 10s run has not elapsed, but the head is down
    // right now and the label should already say so.
    expect(
      participantStatusLabel(participant, {
        label: 'focused',
        activeSignals: [],
        current: { ...current, headDown: true }
      })
    ).toBe('고개 숙임');
    expect(
      participantStatusLabel(participant, {
        label: 'focused',
        activeSignals: [],
        current: { ...current, headTurned: true }
      })
    ).toBe('고개 돌림');
  });

  it('waits for the sustained signal before calling an open mouth a yawn', () => {
    const participant = createParticipant('participant-host', 'Host');
    const current = attentiveFrame({ mouthAspectRatio: 0.7, mouthOpen: true });

    // A mouth open for one frame is talking, so it must not read as a yawn.
    expect(
      participantStatusLabel(participant, { label: 'focused', activeSignals: [], current })
    ).toBe('입 벌림');
    expect(
      participantStatusLabel(participant, { label: 'focused', activeSignals: ['yawning'], current })
    ).toBe('하품');
  });

  it('never reveals why someone else is not focused', () => {
    // No snapshot is passed for other participants, so their tile can only ever
    // show presence — the room is not told about their head, eyes or mouth.
    const distracted = createParticipant('participant-other', 'Other');
    distracted.status = 'distracted';

    expect(participantStatusLabel(distracted)).toBe('주의 이탈');
  });

  it('separates the focus verdict from the detail label', () => {
    expect(focusVerdictLabel('focused')).toBe('집중중');
    expect(focusVerdictLabel('distracted')).toBe('집중 안 함');
    expect(focusVerdictLabel('away')).toBe('집중 안 함');
    expect(focusVerdictLabel('paused')).toBe('집중 안 함');
    expect(focusVerdictLabel('break')).toBe('휴식');
    expect(focusVerdictLabel('online')).toBe('대기');
  });

  it('shows detailed MediaPipe-derived labels for the local participant', () => {
    const participant = createParticipant('participant-host', 'Host');
    const current = attentiveFrame();

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
    // A blink closes the eyes for a fraction of a second, so this one stays on the
    // sustained signal rather than the frame.
    expect(
      participantStatusLabel(participant, {
        label: 'focused',
        activeSignals: [],
        current: { ...current, eyesClosed: true }
      })
    ).toBe('공부 중');
  });

  it('calls an engaged participant playing rather than studying in a game room', () => {
    const participant = createParticipant('participant-host', 'Host');
    participant.status = 'focused';

    expect(participantStatusLabel(participant, undefined, 'study')).toBe('공부 중');
    expect(participantStatusLabel(participant, undefined, 'hidden_mission')).toBe('게임 중');
  });

  it('waits for the sustained signal before calling off-centre eyes a diversion', () => {
    const participant = createParticipant('participant-host', 'Host');
    const current = attentiveFrame({ gazeDivergence: 42, gazeDiverged: true });

    // Eyes sweep past wide angles constantly while reading, so a single frame of
    // divergence must not show up as looking away.
    expect(
      participantStatusLabel(participant, { label: 'focused', activeSignals: [], current })
    ).toBe('공부 중');
    expect(
      participantStatusLabel(participant, {
        label: 'distracted',
        activeSignals: ['gaze_diverged'],
        current
      })
    ).toBe('시선 이탈');
  });

  it('lets a turned head outrank diverged eyes, since the head is the plainer read', () => {
    const participant = createParticipant('participant-host', 'Host');

    expect(
      participantStatusLabel(participant, {
        label: 'distracted',
        activeSignals: ['gaze_diverged'],
        current: attentiveFrame({ headTurned: true, gazeDiverged: true })
      })
    ).toBe('고개 돌림');
  });
});

describe('FocusDetailPanel', () => {
  // Two observed minutes. startedAt must be non-zero: zero is the "session has not
  // begun" sentinel, and every rate would be withheld.
  const readyStats = {
    startedAt: 1_000,
    updatedAt: 121_000,
    faceFrames: 100,
    eyesClosedFrames: 10,
    blinks: 30,
    yawns: 1,
    headTurns: 2,
    headDowns: 0,
    aways: 1,
    gazeDiversions: 3,
    motionSum: 60,
    motionSamples: 100,
    previousSignals: [],
    previousEyesClosed: false
  };

  it('holds back every rate until the session is long enough to have one', () => {
    render(<FocusDetailPanel indices={focusIndices({ ...readyStats, updatedAt: 10_000 })} />);

    expect(screen.getByText(/1분 정도 지나면/)).toBeInTheDocument();
    expect(screen.queryByText('피로도')).not.toBeInTheDocument();
  });

  it('shows the fatigue and distraction readings the panel is for', () => {
    render(<FocusDetailPanel indices={focusIndices(readyStats)} />);

    expect(screen.getByText('피로도')).toBeInTheDocument();
    expect(screen.getByText('산만함')).toBeInTheDocument();
    expect(screen.getByText('하품 빈도')).toBeInTheDocument();
    expect(screen.getByText('눈 깜빡임')).toBeInTheDocument();
    expect(screen.getByText('눈 감김 시간')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('시선 이탈')).toBeInTheDocument();
    expect(screen.getByText('고개 돌림')).toBeInTheDocument();
    expect(screen.getByText('자리 비움')).toBeInTheDocument();
    expect(screen.getByText('자세 흔들림')).toBeInTheDocument();
  });

  it('explains how fatigue and distraction are used', () => {
    render(<FocusDetailPanel indices={focusIndices(readyStats)} />);

    expect(screen.getByText(/피로도는 휴식 제안에/)).toBeInTheDocument();
    expect(screen.getByText(/산만함은 높을 때 점수 흐름에 반영돼요/)).toBeInTheDocument();
  });

  it('suggests a break only once fatigue is actually high', () => {
    const rested = focusIndices(readyStats);
    expect(rested.restSuggested).toBe(false);
    render(<FocusDetailPanel indices={rested} />);
    expect(screen.queryByText(/쉬어가는 게 좋겠어요/)).not.toBeInTheDocument();

    const drowsy = focusIndices({ ...readyStats, eyesClosedFrames: 30 });
    render(<FocusDetailPanel indices={drowsy} />);
    expect(screen.getByText(/쉬어가는 게 좋겠어요/)).toBeInTheDocument();
  });
});

describe('StudyRoom focus nudges', () => {
  const readyStats = {
    startedAt: 1_000,
    updatedAt: 121_000,
    faceFrames: 100,
    eyesClosedFrames: 5,
    blinks: 20,
    yawns: 0,
    headTurns: 0,
    headDowns: 0,
    aways: 0,
    gazeDiversions: 0,
    motionSum: 30,
    motionSamples: 100,
    previousSignals: [],
    previousEyesClosed: false
  };

  it('suggests a break when the local fatigue index is high', () => {
    const participant = createParticipant('participant-host', 'Host');
    const onStartBreak = vi.fn();
    focusDetectionMock.snapshot.sessionStats = {
      ...readyStats,
      eyesClosedFrames: 30,
      yawns: 1
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
        onStartBreak={onStartBreak}
      />
    );

    expect(screen.getByRole('region', { name: '휴식 제안' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '쉬기' }));
    expect(onStartBreak).toHaveBeenCalledTimes(1);
  });

  it('drains score through distracted presence when the distraction index is high', async () => {
    const participant = createParticipant('participant-host', 'Host');
    const onUpdatePresence = vi.fn();
    focusDetectionMock.snapshot.sessionStats = {
      ...readyStats,
      headTurns: 5,
      aways: 3,
      gazeDiversions: 5,
      motionSum: 250
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
        onUpdatePresence={onUpdatePresence}
      />
    );

    await waitFor(() => expect(onUpdatePresence).toHaveBeenCalledWith('distracted'));
    expect(screen.getByRole('region', { name: '집중 상태 확인' })).toBeInTheDocument();
  });

  it('lets the participant confirm focus and immediately restores focused presence', async () => {
    const participant = createParticipant('participant-host', 'Host');
    const onUpdatePresence = vi.fn();
    focusDetectionMock.snapshot.focusSnapshot = {
      label: 'distracted',
      score: 65,
      activeSignals: ['head_turned'],
      durations: {
        face_missing: 0,
        eyes_closed: 0,
        head_turned: 3,
        head_down: 0,
        yawning: 0,
        gaze_diverged: 0
      },
      blinksPerMinute: 0,
      yawnCount: 0,
      motionAmount: 0,
      current: attentiveFrame({ headTurned: true, headPose: { headYaw: 32, headPitch: 0, headRoll: 0 } })
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
        onUpdatePresence={onUpdatePresence}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '집중 중이야' }));
    await waitFor(() => expect(onUpdatePresence).toHaveBeenCalledWith('focused'));
  });

  it('shows the focus confirmation when the local verdict is not focused', () => {
    const participant = createParticipant('participant-host', 'Host');
    focusDetectionMock.snapshot.focusSnapshot = {
      label: 'away',
      score: 0,
      activeSignals: ['face_missing'],
      durations: {
        face_missing: 5,
        eyes_closed: 0,
        head_turned: 0,
        head_down: 0,
        yawning: 0,
        gaze_diverged: 0
      },
      blinksPerMinute: 0,
      yawnCount: 0,
      motionAmount: 0,
      current: attentiveFrame({ facePresent: false })
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
      />
    );

    expect(screen.getByRole('region', { name: '집중 상태 확인' })).toBeInTheDocument();
  });

  it('passes the latest focus report when leaving study mode', () => {
    const participant = createParticipant('participant-host', 'Host');
    const onLeaveRoom = vi.fn();
    focusDetectionMock.snapshot.sessionStats = {
      ...readyStats,
      eyesClosedFrames: 20,
      blinks: 48,
      yawns: 1,
      headTurns: 4,
      aways: 1,
      gazeDiversions: 5,
      motionSum: 120
    };

    render(
      <StudyRoom
        {...baseStudyRoomProps(participant)}
        room={createRoom('hidden_mission', 'study')}
        onLeaveRoom={onLeaveRoom}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '나가기' }));

    expect(onLeaveRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        ready: true,
        observedMinutes: 2,
        fatigue: expect.any(Number),
        distraction: expect.any(Number)
      })
    );
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
  it('can generate every distraction card game type', () => {
    expect(createDistractionCardByKind('memory').title).toBe('순간 기억');
    expect(createDistractionCardByKind('quick_choice').title).toBe('빠른 선택');
    expect(createDistractionCardByKind('odd_expression').title).toBe('다른 표정 찾기');
  });

  it('randomizes the memory distraction answer and shows it before the question', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = createDistractionCardByKind('memory');
    randomSpy.mockReturnValue(0.99);
    const second = createDistractionCardByKind('memory');

    expect(first.answer).toBe('2');
    expect(first.introPrompt).toBe('기억할 숫자: 2');
    expect(second.answer).toBe('9');
    expect(second.introPrompt).toBe('기억할 숫자: 9');
  });

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
        startedAt: new Date(Date.now()).toISOString(),
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
    vi.setSystemTime(new Date(currentGame.round.startedAt!));

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
    expect(screen.getByRole('heading', { name: '순간 기억 1/3' })).toBeInTheDocument();
    expect(screen.getByText('기억할 숫자: 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('방해 카드를 풀어야 미션이 다시 진행돼요.')).toBeInTheDocument();

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
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('heading', { name: '빠른 선택 2/3' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    fireEvent.click(screen.getByRole('button', { name: '24' }));
    expect(screen.getByRole('heading', { name: '순간 기억 3/3' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    vi.useRealTimers();

    await waitFor(() =>
      expect(onSubmitMissionResult).toHaveBeenCalledWith({
        playerId: host.id,
        missionId: privateMission.id,
        count: 1,
        success: true
      })
    );
  });

  it('allows accusing any other participant but only wins inside the mission progress window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };
    const room = createRoom();
    const hostMission: HiddenMission = {
      id: 'mission-host',
      playerId: host.id,
      prompt: 'Smile once',
      verify: 'smile_count',
      target: 1
    };
    const memberMission: HiddenMission = {
      id: 'mission-member',
      playerId: member.id,
      prompt: 'Wink once',
      verify: 'wink_count',
      target: 1
    };
    const currentGame: GameSession = {
      ...createGame(room, [host, member], 'hidden_mission'),
      missions: [hostMission, memberMission]
    };
    const onWinByMissionGuess = vi.fn();

    const { rerender } = render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host, member]}
        room={room}
        privateMission={hostMission}
        onWinByMissionGuess={onWinByMissionGuess}
      />
    );

    expect(screen.getByRole('button', { name: 'Host' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Member' }));
    expect(screen.getByRole('dialog', { name: '미션 맞추기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: memberMission.prompt })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: memberMission.prompt }));
    expect(onWinByMissionGuess).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const nextGame = {
      ...currentGame,
      missionResults: [
        { playerId: member.id, missionId: memberMission.id, count: 1, success: false }
      ]
    };
    rerender(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={nextGame}
        participants={[host, member]}
        room={room}
        privateMission={hostMission}
        onWinByMissionGuess={onWinByMissionGuess}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Member' }));
    fireEvent.click(screen.getByRole('button', { name: memberMission.prompt }));

    expect(onWinByMissionGuess).toHaveBeenCalledWith(host.id, member.id, memberMission.id);
    vi.useRealTimers();
  });

  it('opens mission guess choices even when the public game snapshot hides missions', () => {
    const host = createParticipant('participant-host', 'Host');
    const member = { ...createParticipant('participant-member', 'Member'), role: 'member' as const };
    const room = createRoom();
    const hostMission: HiddenMission = {
      id: 'mission-host',
      playerId: host.id,
      prompt: 'Smile once',
      verify: 'smile_count',
      target: 1
    };
    const currentGame: GameSession = {
      ...createGame(room, [host, member], 'hidden_mission'),
      missions: [hostMission]
    };
    const onWinByMissionGuess = vi.fn();

    render(
      <StudyRoom
        {...baseStudyRoomProps(host)}
        currentGame={currentGame}
        participants={[host, member]}
        room={room}
        onWinByMissionGuess={onWinByMissionGuess}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Member' }));

    expect(screen.getByRole('dialog', { name: '미션 맞추기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: hostMission.prompt })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대화 중 한 번 윙크하기' })).toBeInTheDocument();
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
