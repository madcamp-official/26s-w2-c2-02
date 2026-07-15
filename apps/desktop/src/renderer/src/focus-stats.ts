import { clamp, round, type FocusSignalName, type FocusSnapshot } from './focus-pipeline';

/**
 * Session-long tallies behind the focus detail panel.
 *
 * The rule window is 30 seconds, which is the right horizon for "is this person
 * focused right now" and the wrong one for fatigue: yawns arrive a few times an
 * hour, so a 30 second window reads 0 almost always and 120/hour the moment one
 * lands. These counters therefore run for the whole session, folded frame by frame
 * from the snapshots the rules already produce.
 *
 * Events are counted on the rising edge of a *sustained* signal rather than a raw
 * frame flag, so `headTurns` means "turned away from the desk" the same number of
 * times a person would say it, not once per frame of the turn.
 */

export type FocusSessionStats = {
  startedAt: number;
  updatedAt: number;
  faceFrames: number;
  eyesClosedFrames: number;
  blinks: number;
  yawns: number;
  headTurns: number;
  headDowns: number;
  aways: number;
  gazeDiversions: number;
  /** Running total of head jitter, and the frames it was summed over. */
  motionSum: number;
  motionSamples: number;
  /** Previous frame's readings, kept only to detect the rising edges above. */
  previousSignals: FocusSignalName[];
  previousEyesClosed: boolean;
};

export type FocusIndices = {
  /** False until enough of a session has been seen for the rates to mean anything. */
  ready: boolean;
  observedMinutes: number;
  /** Share of face-visible time with the eyes shut. The literature calls this PERCLOS. */
  eyesClosedRatio: number;
  blinksPerMinute: number;
  yawnsPerHour: number;
  headTurnsPerHour: number;
  awaysPerHour: number;
  gazeDiversionsPerHour: number;
  /** Head jitter mapped onto 0..100, where 0 is sitting still. */
  restlessness: number;
  fatigue: number;
  distraction: number;
  restSuggested: boolean;
};

/**
 * Rates need a denominator before they say anything: one yawn 20 seconds in is not
 * 180 yawns an hour. The panel shows "측정 중" until this much face time is in.
 */
const minimumObservedSeconds = 60;

/** Fatigue is unproven and only ever suggests a break, so this gate stays loose. */
const restSuggestionThreshold = 60;

export const emptyFocusSessionStats: FocusSessionStats = {
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

export function accumulateFocusStats(
  previous: FocusSessionStats,
  snapshot: FocusSnapshot,
  timestamp: number
): FocusSessionStats {
  const current = snapshot.current;
  const signals = new Set(snapshot.activeSignals);
  const previousSignals = new Set(previous.previousSignals);
  const rose = (signal: FocusSignalName) => (signals.has(signal) && !previousSignals.has(signal) ? 1 : 0);

  return {
    startedAt: previous.startedAt === 0 ? timestamp : previous.startedAt,
    updatedAt: timestamp,
    faceFrames: previous.faceFrames + (current.facePresent ? 1 : 0),
    eyesClosedFrames: previous.eyesClosedFrames + (current.facePresent && current.eyesClosed ? 1 : 0),
    // A blink is an eye closure that started, so it counts on the edge. A drowsy
    // closure lasting seconds adds one here too; eyesClosedRatio is what separates
    // the two, and it is weighted far above blink rate below.
    blinks: previous.blinks + (current.eyesClosed && !previous.previousEyesClosed ? 1 : 0),
    yawns: previous.yawns + rose('yawning'),
    headTurns: previous.headTurns + rose('head_turned'),
    headDowns: previous.headDowns + rose('head_down'),
    aways: previous.aways + rose('face_missing'),
    gazeDiversions: previous.gazeDiversions + rose('gaze_diverged'),
    // Only sampled while the face is visible. An absent face reports no motion, and
    // averaging those zeros in would make leaving the desk look like sitting still.
    motionSum: previous.motionSum + (current.facePresent ? snapshot.motionAmount : 0),
    motionSamples: previous.motionSamples + (current.facePresent ? 1 : 0),
    previousSignals: snapshot.activeSignals,
    previousEyesClosed: current.eyesClosed
  };
}

export function focusIndices(stats: FocusSessionStats): FocusIndices {
  const observedSeconds = stats.startedAt === 0 ? 0 : (stats.updatedAt - stats.startedAt) / 1000;
  const observedMinutes = observedSeconds / 60;
  const perMinute = (count: number) => (observedMinutes > 0 ? count / observedMinutes : 0);
  const perHour = (count: number) => perMinute(count) * 60;

  const eyesClosedRatio = stats.faceFrames > 0 ? stats.eyesClosedFrames / stats.faceFrames : 0;
  const blinksPerMinute = perMinute(stats.blinks);
  const yawnsPerHour = perHour(stats.yawns);
  const headTurnsPerHour = perHour(stats.headTurns);
  const awaysPerHour = perHour(stats.aways);
  const gazeDiversionsPerHour = perHour(stats.gazeDiversions);
  const averageMotion = stats.motionSamples > 0 ? stats.motionSum / stats.motionSamples : 0;
  // The shakiest bounds in this file. Head jitter has no natural unit — it is a mean
  // per-frame change in pose ratios, so it also moves with frame rate — and unlike
  // blink rate or PERCLOS there is no published resting level to anchor to. These
  // come from what the arithmetic implies: landmark noise on a still head lands near
  // 0.3, and deliberately turning to look at something crosses 2. Read the 자세 흔들림
  // meter on the tuning screen for a session and move them.
  const restlessness = Math.round(normalise(averageMotion, 0.5, 3) * 100);

  // Weights are deliberate but unvalidated, which is exactly why these two indices
  // only ever display and suggest. The focus score and the ranking stay on the
  // duration rules; nothing here can move them.
  const fatigue = weighted([
    // PERCLOS leads: it is the one measure of the three with real drowsiness
    // research behind it, where sustained closure above ~15% marks the onset. Its
    // weight equals the suggestion threshold on purpose, so eyes shut a quarter of
    // the session asks for a break on its own, without needing a yawn to agree.
    [restSuggestionThreshold, normalise(eyesClosedRatio, 0.05, 0.25)],
    [25, normalise(yawnsPerHour, 1, 8)],
    // Tiring eyes blink more, but resting rate is personal (roughly 15-20/min and
    // far outside it for plenty of people), so it carries the least weight.
    [15, normalise(blinksPerMinute, 18, 32)]
  ]);
  const distraction = weighted([
    [35, normalise(gazeDiversionsPerHour, 2, 20)],
    [30, normalise(headTurnsPerHour, 2, 20)],
    [20, normalise(awaysPerHour, 1, 8)],
    // Lightest of the four, and on purpose: the other three caught someone looking
    // away from the desk, while fidgeting is restlessness, which plenty of people do
    // while working. It belongs here, but it should not decide the reading alone.
    [15, restlessness / 100]
  ]);
  const ready = observedSeconds >= minimumObservedSeconds && stats.faceFrames > 0;

  return {
    ready,
    observedMinutes: round(observedMinutes, 1),
    eyesClosedRatio: round(eyesClosedRatio, 3),
    blinksPerMinute: round(blinksPerMinute, 1),
    yawnsPerHour: round(yawnsPerHour, 1),
    headTurnsPerHour: round(headTurnsPerHour, 1),
    awaysPerHour: round(awaysPerHour, 1),
    gazeDiversionsPerHour: round(gazeDiversionsPerHour, 1),
    restlessness,
    fatigue,
    distraction,
    // Suggesting a break off 20 seconds of noise would train people to ignore it.
    restSuggested: ready && fatigue >= restSuggestionThreshold
  };
}

/** Maps a reading onto 0..1 between a resting level and a clearly-elevated one. */
function normalise(value: number, restingLevel: number, elevatedLevel: number) {
  if (elevatedLevel === restingLevel) {
    return 0;
  }

  return clamp((value - restingLevel) / (elevatedLevel - restingLevel), 0, 1);
}

function weighted(terms: [number, number][]) {
  return Math.round(clamp(terms.reduce((sum, [weight, value]) => sum + weight * value, 0), 0, 100));
}
