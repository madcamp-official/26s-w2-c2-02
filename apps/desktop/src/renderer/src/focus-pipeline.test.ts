import { describe, expect, it } from 'vitest';
import {
  buildFeatureWindow,
  classifyFocus,
  defaultRuleSettings,
  extractFrameSignals,
  fromMlFocusLabel,
  getLatestDuration,
  toMlFocusLabel,
  updateSignalWindow,
  type FrameSignals,
  type LandmarkPoint
} from './focus-pipeline';

const focusedFrame: Omit<FrameSignals, 'timestamp'> = {
  facePresent: true,
  eyeAspectRatio: 0.3,
  headYawRatio: 0,
  headPitchRatio: 0,
  eyesClosed: false,
  headTurned: false,
  headDown: false
};

/** Frames spanning `seconds`, sampled every 100ms, ending at t = seconds * 1000. */
function frameRun(seconds: number, overrides: Partial<FrameSignals> = {}): FrameSignals[] {
  const count = seconds * 10 + 1;
  return Array.from({ length: count }, (_, index) => ({
    ...focusedFrame,
    timestamp: index * 100,
    ...overrides
  }));
}

describe('classifyFocus', () => {
  it('reports focused when no signal crosses its threshold', () => {
    const snapshot = classifyFocus(frameRun(10), defaultRuleSettings);

    expect(snapshot.label).toBe('focused');
    expect(snapshot.score).toBe(100);
    expect(snapshot.activeSignals).toEqual([]);
  });

  it('reports away once the face has been missing past faceMissingSeconds', () => {
    const snapshot = classifyFocus(frameRun(5, { facePresent: false }), defaultRuleSettings);

    expect(snapshot.label).toBe('away');
    expect(snapshot.activeSignals).toContain('face_missing');
    expect(snapshot.score).toBe(100 - defaultRuleSettings.faceMissingPenalty);
  });

  it('keeps the face present but reports sleepy while the eyes stay closed', () => {
    const snapshot = classifyFocus(
      frameRun(3, { eyesClosed: true, eyeAspectRatio: 0.1 }),
      defaultRuleSettings
    );

    expect(snapshot.label).toBe('sleepy');
    expect(snapshot.activeSignals).toEqual(['eyes_closed']);
  });

  // A turned head alone costs 30 points, which lands inside the uncertain band
  // (focusedThreshold - 10) rather than distracted. Signals have to stack before
  // the label hardens.
  it('holds at uncertain when only the head turn signal fires', () => {
    const snapshot = classifyFocus(
      frameRun(10, { headTurned: true, headYawRatio: 0.4 }),
      defaultRuleSettings
    );

    expect(snapshot.label).toBe('uncertain');
    expect(snapshot.score).toBe(70);
    expect(snapshot.activeSignals).toEqual(['head_turned']);
  });

  it('reports distracted once stacked signals drop the score below the band', () => {
    const snapshot = classifyFocus(
      frameRun(10, { headTurned: true, headYawRatio: 0.4, headDown: true, headPitchRatio: 0.5 }),
      defaultRuleSettings
    );

    expect(snapshot.label).toBe('distracted');
    expect(snapshot.activeSignals).toEqual(['head_turned', 'head_down']);
  });

  it('does not fire a signal that has not lasted long enough', () => {
    const snapshot = classifyFocus(frameRun(2, { facePresent: false }), defaultRuleSettings);

    expect(snapshot.activeSignals).toEqual([]);
    expect(snapshot.label).toBe('focused');
  });

  it('can report away immediately when face missing delay is disabled', () => {
    const snapshot = classifyFocus(
      frameRun(0, { facePresent: false }),
      { ...defaultRuleSettings, faceMissingSeconds: 0 }
    );

    expect(snapshot.label).toBe('away');
    expect(snapshot.activeSignals).toContain('face_missing');
  });

  it('does not report away with zero face delay while the latest frame has a face', () => {
    const snapshot = classifyFocus(
      frameRun(0),
      { ...defaultRuleSettings, faceMissingSeconds: 0 }
    );

    expect(snapshot.label).toBe('focused');
    expect(snapshot.activeSignals).not.toContain('face_missing');
  });
});

describe('getLatestDuration', () => {
  it('measures only the trailing run, not earlier matches in the window', () => {
    const frames: FrameSignals[] = [
      { ...focusedFrame, timestamp: 0, facePresent: false },
      { ...focusedFrame, timestamp: 1_000 },
      { ...focusedFrame, timestamp: 2_000, facePresent: false },
      { ...focusedFrame, timestamp: 3_000, facePresent: false }
    ];

    expect(getLatestDuration(frames, (frame) => !frame.facePresent)).toBe(1);
  });

  it('returns 0 when the newest frame does not match', () => {
    const frames: FrameSignals[] = [
      { ...focusedFrame, timestamp: 0, facePresent: false },
      { ...focusedFrame, timestamp: 1_000 }
    ];

    expect(getLatestDuration(frames, (frame) => !frame.facePresent)).toBe(0);
  });
});

describe('updateSignalWindow', () => {
  it('drops frames older than the configured window', () => {
    const settings = { ...defaultRuleSettings, windowSeconds: 10 };
    const existing: FrameSignals[] = [
      { ...focusedFrame, timestamp: 0 },
      { ...focusedFrame, timestamp: 5_000 }
    ];
    const next: FrameSignals = { ...focusedFrame, timestamp: 12_000 };

    const window = updateSignalWindow(existing, next, settings);

    expect(window.map((frame) => frame.timestamp)).toEqual([5_000, 12_000]);
  });
});

describe('buildFeatureWindow', () => {
  const identity = { userId: 'participant-1', sessionId: 'session-1' };

  it('carries the caller identity instead of a hardcoded test user', () => {
    const frames = frameRun(20);
    const window = buildFeatureWindow(
      frames,
      classifyFocus(frames, defaultRuleSettings),
      0,
      20_000,
      identity
    );

    expect(window.userId).toBe('participant-1');
    expect(window.sessionId).toBe('session-1');
    expect(window.durationSec).toBe(20);
  });

  it('derives ratios from the detected frames', () => {
    const frames = [...frameRun(5, { facePresent: false }), ...frameRun(5)].map(
      (frame, index) => ({ ...frame, timestamp: index * 100 })
    );
    const window = buildFeatureWindow(
      frames,
      classifyFocus(frames, defaultRuleSettings),
      0,
      10_000,
      identity
    );

    expect(window.features.facePresenceRatio).toBeCloseTo(0.5, 2);
    expect(window.features.lowConfidenceRatio).toBeCloseTo(0.5, 2);
    expect(window.features.eyeClosedRatio).toBe(0);
  });

  it('clamps the reported duration into the schema range', () => {
    const frames = frameRun(1);
    const window = buildFeatureWindow(
      frames,
      classifyFocus(frames, defaultRuleSettings),
      0,
      1_000,
      identity
    );

    expect(window.durationSec).toBe(5);
  });
});

describe('label mapping', () => {
  it('collapses local labels onto the ML schema', () => {
    expect(toMlFocusLabel('focused')).toBe('focused');
    expect(toMlFocusLabel('away')).toBe('away');
    expect(toMlFocusLabel('uncertain')).toBe('distracted');
    expect(toMlFocusLabel('sleepy')).toBe('break_or_paused');
    expect(toMlFocusLabel('paused')).toBe('break_or_paused');
  });

  it('expands ML labels back to local labels', () => {
    expect(fromMlFocusLabel('break_or_paused')).toBe('sleepy');
    expect(fromMlFocusLabel('distracted')).toBe('distracted');
  });
});

describe('extractFrameSignals', () => {
  it('marks the face as absent when there are no landmarks', () => {
    const signals = extractFrameSignals(undefined, defaultRuleSettings, 1_234, null);

    expect(signals).toMatchObject({ timestamp: 1_234, facePresent: false, eyeAspectRatio: 0 });
  });

  it('flags a downward pitch as head down', () => {
    const face = syntheticFace({ noseY: 0.9 });
    const signals = extractFrameSignals(face, defaultRuleSettings, 0, null);

    expect(signals.facePresent).toBe(true);
    expect(signals.headDown).toBe(true);
  });
});

/**
 * A minimal 468-point face: eyes near the top, nose placed by the caller. Only
 * the landmark indices the pipeline reads are meaningful.
 */
function syntheticFace({ noseY }: { noseY: number }): LandmarkPoint[] {
  const face: LandmarkPoint[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));

  face[0] = { x: 0.5, y: 0 };
  face[1] = { x: 0.5, y: noseY };
  [33, 133, 362, 263].forEach((index) => {
    face[index] = { x: 0.5, y: 0.2 };
  });
  face[467] = { x: 0.5, y: 1 };

  return face;
}
