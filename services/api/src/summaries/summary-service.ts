export type SessionSummary = {
  focusMinutes: number;
  goalCompletionRate: number;
  returnRate: number;
};

export function createEmptySummary(): SessionSummary {
  return {
    focusMinutes: 0,
    goalCompletionRate: 0,
    returnRate: 0
  };
}
