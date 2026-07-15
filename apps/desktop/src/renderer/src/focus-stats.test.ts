import { describe, expect, it } from 'vitest';
import {
  accumulateFocusStats,
  emptyFocusSessionStats,
  focusIndices,
  type FocusSessionStats
} from './focus-stats';
import { emptyFocusSnapshot, type FocusSignalName, type FocusSnapshot } from './focus-pipeline';

function snapshot(
  activeSignals: FocusSignalName[],
  current: Partial<FocusSnapshot['current']> = {}
): FocusSnapshot {
  return {
    ...emptyFocusSnapshot,
    activeSignals,
    current: { ...emptyFocusSnapshot.current, facePresent: true, ...current }
  };
}

/** Folds a script of snapshots in at one-second intervals. */
function fold(steps: FocusSnapshot[], startedAt = 1_000) {
  return steps.reduce<FocusSessionStats>(
    (stats, step, index) => accumulateFocusStats(stats, step, startedAt + index * 1_000),
    emptyFocusSessionStats
  );
}

describe('accumulateFocusStats', () => {
  it('counts one event per sustained signal, not one per frame', () => {
    // A ten second head turn is one turn. Counting frames would report thirty.
    const stats = fold([
      snapshot([]),
      snapshot(['head_turned']),
      snapshot(['head_turned']),
      snapshot(['head_turned']),
      snapshot([]),
      snapshot(['head_turned'])
    ]);

    expect(stats.headTurns).toBe(2);
  });

  it('tallies each signal onto its own counter', () => {
    const stats = fold([
      snapshot([]),
      snapshot(['yawning']),
      snapshot(['face_missing'], { facePresent: false }),
      snapshot(['gaze_diverged']),
      snapshot(['head_down'])
    ]);

    expect(stats.yawns).toBe(1);
    expect(stats.aways).toBe(1);
    expect(stats.gazeDiversions).toBe(1);
    expect(stats.headDowns).toBe(1);
  });

  it('counts blinks on the closing edge and tracks closed time separately', () => {
    const stats = fold([
      snapshot([], { eyesClosed: false }),
      snapshot([], { eyesClosed: true }),
      snapshot([], { eyesClosed: true }),
      snapshot([], { eyesClosed: false }),
      snapshot([], { eyesClosed: true })
    ]);

    expect(stats.blinks).toBe(2);
    expect(stats.eyesClosedFrames).toBe(3);
    expect(stats.faceFrames).toBe(5);
  });

  it('ignores frames with no face when measuring closed-eye time', () => {
    // PERCLOS is a share of observed time; a frame where the face is gone observed
    // nothing and must not dilute the ratio.
    const stats = fold([
      snapshot([], { facePresent: false, eyesClosed: false }),
      snapshot([], { eyesClosed: true }),
      snapshot([], { eyesClosed: false })
    ]);

    expect(stats.faceFrames).toBe(2);
    expect(focusIndices(stats).eyesClosedRatio).toBe(0.5);
  });
});

describe('focusIndices', () => {
  it('withholds every rate until a session is long enough to have one', () => {
    // One yawn twenty seconds in is not 180 yawns an hour.
    const stats = fold([snapshot([]), snapshot(['yawning'])]);

    expect(focusIndices(stats).ready).toBe(false);
    expect(focusIndices(stats).restSuggested).toBe(false);
  });

  it('reports a rested session as low on both indices', () => {
    const steps = Array.from({ length: 120 }, () => snapshot([], { eyesClosed: false }));
    const indices = focusIndices(fold(steps));

    expect(indices.ready).toBe(true);
    expect(indices.fatigue).toBe(0);
    expect(indices.distraction).toBe(0);
    expect(indices.restSuggested).toBe(false);
  });

  it('suggests a break once the eyes are shut for a quarter of the session', () => {
    // Blink rate here is a resting 15/min and there are no yawns, so this pins the
    // claim that PERCLOS alone asks for the break: eyes shut a quarter of the time
    // is drowsy whether or not the other two readings agree.
    const steps = Array.from({ length: 200 }, (_, index) =>
      snapshot([], { eyesClosed: index % 4 === 0 })
    );
    const indices = focusIndices(fold(steps));

    expect(indices.eyesClosedRatio).toBe(0.25);
    expect(indices.fatigue).toBeGreaterThanOrEqual(60);
    expect(indices.restSuggested).toBe(true);
  });

  it('keeps both indices inside 0..100 when every reading is pinned', () => {
    const steps = Array.from({ length: 200 }, (_, index) =>
      index % 2 === 0
        ? snapshot(['yawning', 'head_turned', 'gaze_diverged', 'face_missing'], { eyesClosed: true })
        : snapshot([], { eyesClosed: false })
    );
    const indices = focusIndices(fold(steps));

    expect(indices.fatigue).toBeLessThanOrEqual(100);
    expect(indices.distraction).toBe(100);
  });

  it('starts from zero rather than dividing by an unstarted session', () => {
    const indices = focusIndices(emptyFocusSessionStats);

    expect(indices.observedMinutes).toBe(0);
    expect(indices.fatigue).toBe(0);
    expect(indices.blinksPerMinute).toBe(0);
    expect(indices.ready).toBe(false);
  });
});
