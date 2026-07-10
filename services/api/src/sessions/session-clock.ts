export type SessionPhase = 'waiting' | 'studying' | 'break' | 'ended';

export type SessionClock = {
  phase: SessionPhase;
  startedAt?: string;
  endsAt?: string;
};

export function createWaitingClock(): SessionClock {
  return { phase: 'waiting' };
}
