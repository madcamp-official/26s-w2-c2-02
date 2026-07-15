import type { FocusRankingEntry, Goal, SessionSummary, StudySession } from '@roomi/shared';

export function createEmptySummary(): SessionSummary {
  return {
    focusMinutes: 0,
    goalCompletionRate: 0
  };
}

/**
 * `focusMinutes` is the room-wide average of the focus time RoomService actually
 * tracked from detection, so it is the number Roomi may quote to the whole room.
 * Per-participant minutes live in `ranking` — read those, not this, when showing
 * one person their own session.
 */
export function computeSummary(
  session: StudySession,
  goals: Goal[],
  ranking: FocusRankingEntry[] = []
): SessionSummary {
  const goalCompletionRate =
    goals.length === 0 ? 0 : goals.filter((goal) => goal.achieved).length / goals.length;

  return {
    focusMinutes: averageFocusMinutes(ranking) ?? elapsedMinutes(session),
    goalCompletionRate
  };
}

function averageFocusMinutes(ranking: FocusRankingEntry[]): number | null {
  if (ranking.length === 0) {
    return null;
  }

  const total = ranking.reduce((sum, entry) => sum + entry.focusMinutes, 0);
  return Math.round(total / ranking.length);
}

/** Fallback for sessions with no tracked focus at all (detection never ran). */
function elapsedMinutes(session: StudySession): number {
  const startedAtMs = Date.parse(session.startedAt);
  const endedAtMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();
  const elapsed = Math.max(0, (endedAtMs - startedAtMs) / 60_000);
  return Math.round(Math.min(elapsed, session.plannedMinutes));
}
