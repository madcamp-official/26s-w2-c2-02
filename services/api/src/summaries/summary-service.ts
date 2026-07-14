import type { Goal, SessionSummary, StudySession } from '@roomi/shared';

export function createEmptySummary(): SessionSummary {
  return {
    focusMinutes: 0,
    goalCompletionRate: 0
  };
}

export function computeSummary(session: StudySession, goals: Goal[]): SessionSummary {
  const startedAtMs = Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const elapsedMinutes = Math.max(0, (endedAtMs - startedAtMs) / 60_000);
  const focusMinutes = Math.round(Math.min(elapsedMinutes, session.plannedMinutes));

  const goalCompletionRate =
    goals.length === 0 ? 0 : goals.filter((goal) => goal.achieved).length / goals.length;

  return {
    focusMinutes,
    goalCompletionRate
  };
}
