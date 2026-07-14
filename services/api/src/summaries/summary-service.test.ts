import { describe, expect, it } from 'vitest';
import type { Goal, StudySession } from '@roomi/shared';
import { computeSummary, createEmptySummary } from './summary-service';

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 'session-1',
    roomId: 'room-1',
    startedAt: '2026-07-13T00:00:00.000Z',
    plannedMinutes: 50,
    mode: 'ended',
    ...overrides
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    roomId: 'room-1',
    participantId: 'participant-1',
    rawText: '수학 3단원',
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides
  };
}

describe('createEmptySummary', () => {
  it('returns a zeroed summary', () => {
    expect(createEmptySummary()).toEqual({ focusMinutes: 0, goalCompletionRate: 0 });
  });
});

describe('computeSummary', () => {
  it('derives focus minutes from the elapsed time between start and end', () => {
    const summary = computeSummary(
      session({ startedAt: '2026-07-13T00:00:00.000Z', endedAt: '2026-07-13T00:42:00.000Z' }),
      []
    );

    expect(summary.focusMinutes).toBe(42);
  });

  it('caps focus minutes at the planned duration', () => {
    const summary = computeSummary(
      session({
        plannedMinutes: 25,
        startedAt: '2026-07-13T00:00:00.000Z',
        endedAt: '2026-07-13T01:00:00.000Z'
      }),
      []
    );

    expect(summary.focusMinutes).toBe(25);
  });

  it('computes the share of achieved goals', () => {
    const summary = computeSummary(session({ endedAt: '2026-07-13T00:10:00.000Z' }), [
      goal({ id: 'goal-1', achieved: true }),
      goal({ id: 'goal-2', achieved: false }),
      goal({ id: 'goal-3', achieved: true })
    ]);

    expect(summary.goalCompletionRate).toBeCloseTo(2 / 3);
  });

  it('returns a 0 completion rate when there are no goals', () => {
    const summary = computeSummary(session({ endedAt: '2026-07-13T00:10:00.000Z' }), []);

    expect(summary.goalCompletionRate).toBe(0);
  });
});
