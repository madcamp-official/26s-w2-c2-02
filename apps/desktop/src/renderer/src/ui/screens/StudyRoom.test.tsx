import { describe, expect, it } from 'vitest';
import { formatSessionTime, remainingSessionSeconds } from './StudyRoom';

describe('StudyRoom session clock', () => {
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
