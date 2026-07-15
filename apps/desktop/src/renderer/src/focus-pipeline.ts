import type { FeatureWindowV1, MlFocusLabel, PredictResponse } from './focus-ml-client';
import { gazeDivergenceDegrees } from './gaze';
import { headPoseFromMatrix, type HeadPose } from './head-pose';

/**
 * Local focus estimation shared by the MediaPipe tuning screen and the study
 * room session. Everything here is pure: landmarks in, focus label out. The
 * camera lifecycle lives in `use-focus-detection`, so thresholds tuned on the
 * test screen apply unchanged to a real session.
 */

export type FocusLabel = 'focused' | 'distracted' | 'away' | 'sleepy' | 'uncertain' | 'paused';

export type FocusSignalName =
  | 'face_missing'
  | 'eyes_closed'
  | 'head_turned'
  | 'head_down'
  | 'yawning'
  | 'gaze_diverged';

export type LandmarkPoint = {
  x: number;
  y: number;
};

export type RuleSettings = {
  windowSeconds: number;
  focusedThreshold: number;
  faceMissingSeconds: number;
  eyesClosedSeconds: number;
  headTurnedSeconds: number;
  headDownSeconds: number;
  eyeAspectRatioThreshold: number;
  /** Degrees of yaw away from centre before the head counts as turned. */
  headTurnDegreesThreshold: number;
  /** Degrees of downward pitch before the head counts as down. */
  headDownDegreesThreshold: number;
  /** Mouth aspect ratio above which the mouth counts as wide open. */
  mouthAspectRatioThreshold: number;
  /**
   * How long the mouth must stay wide open to count as a yawn. This is what
   * separates a yawn from talking or laughing, which open the mouth in bursts.
   */
  yawningSeconds: number;
  /** An eye closure shorter than this is a blink; a longer one means drowsy. */
  blinkMaxSeconds: number;
  /** Degrees the eyes may point away from where the head faces before it counts. */
  gazeDivergenceDegreesThreshold: number;
  /** How long that divergence must hold before it counts as looking elsewhere. */
  gazeDivergedSeconds: number;
  faceMissingPenalty: number;
  eyesClosedPenalty: number;
  headTurnedPenalty: number;
  headDownPenalty: number;
  yawningPenalty: number;
  gazeDivergedPenalty: number;
};

export type FrameSignals = {
  timestamp: number;
  facePresent: boolean;
  eyeAspectRatio: number;
  headYawRatio: number;
  headPitchRatio: number;
  /**
   * Real 6DoF angles, and the source the head rules judge against. Null when
   * MediaPipe supplied no transformation matrix for the frame, which is the only
   * case where the ratios above are still used to derive an angle.
   */
  headPose: HeadPose | null;
  /**
   * Degrees the eyes point away from where the head faces. Null when the mesh has
   * no iris landmarks, which leaves `gazeDiverged` false: an unmeasured gaze must
   * never be scored as if it had been measured and found wanting.
   */
  gazeDivergence: number | null;
  mouthAspectRatio: number;
  eyesClosed: boolean;
  headTurned: boolean;
  headDown: boolean;
  mouthOpen: boolean;
  gazeDiverged: boolean;
};

export type FocusSnapshot = {
  label: FocusLabel;
  score: number;
  activeSignals: FocusSignalName[];
  durations: Record<FocusSignalName, number>;
  /**
   * Fatigue readings aggregated over the window. They are reported but not scored:
   * a resting blink rate is personal (roughly 15-20 per minute, but far outside
   * that for plenty of people), so a fixed threshold here would invent the same
   * false positives the angle thresholds were tuned to avoid. Judge these once
   * per-participant baselines exist.
   */
  blinksPerMinute: number;
  yawnCount: number;
  /**
   * How much the head jitters across the window. Reported, not scored: fidgeting
   * says restless, and restless people are often still working.
   */
  motionAmount: number;
  current: Omit<FrameSignals, 'timestamp'>;
};

export type FocusIdentity = {
  userId: string;
  sessionId: string;
};

export const defaultRuleSettings: RuleSettings = {
  windowSeconds: 30,
  focusedThreshold: 70,
  faceMissingSeconds: 5,
  eyesClosedSeconds: 3,
  // Duration is where the sensitivity comes from. A head held away from the desk
  // for a few seconds is already a real turn, and the angles below cannot be pushed
  // much further without eating the margin that the measured range bought.
  headTurnedSeconds: 3,
  headDownSeconds: 5,
  eyeAspectRatioThreshold: 0.19,
  // Sitting and studying comfortably spans roughly +-25 degrees of yaw and up to
  // +20 of pitch, so both thresholds sit outside that band: inside it, ordinary
  // reading and shifting in a chair would read as distraction. These are the only
  // numbers here measured on a real person rather than reasoned, so the margin over
  // 25 stays deliberate — the motion boost already spends a degree of it.
  headTurnDegreesThreshold: 28,
  headDownDegreesThreshold: 25,
  mouthAspectRatioThreshold: 0.6,
  // A yawn holds the mouth wide for a couple of seconds; talking and laughing open
  // it in bursts. What keeps those out is mostly the 0.6 ratio above — a mouth that
  // wide is not a word — so this only has to outlast a burst, not a whole yawn.
  yawningSeconds: 1,
  blinkMaxSeconds: 1,
  // Eyes rove constantly while reading, so this rule leans on duration rather than
  // a tight angle. At a normal 60cm desk distance the far edge of a 27" monitor is
  // about 27 degrees off-axis, which is the floor this cannot go under: reading your
  // own screen must never register. 30 keeps a small margin over it, and five seconds
  // of holding it is reading something else rather than glancing at a notification.
  gazeDivergenceDegreesThreshold: 30,
  gazeDivergedSeconds: 5,
  faceMissingPenalty: 70,
  eyesClosedPenalty: 45,
  headTurnedPenalty: 30,
  headDownPenalty: 35,
  // A yawn says tired, not distracted, and tired people are usually still working.
  // The penalty is small on purpose: it should nudge the score toward a break
  // suggestion, not on its own drag someone out of `focused`.
  yawningPenalty: 15,
  // Same weight as a turned head: both mean attention has settled somewhere off
  // the desk, and only the body part giving it away differs.
  gazeDivergedPenalty: 30
};

export const emptyFocusSnapshot: FocusSnapshot = {
  label: 'paused',
  score: 0,
  activeSignals: ['face_missing'],
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
    facePresent: false,
    eyeAspectRatio: 0,
    headYawRatio: 0,
    headPitchRatio: 0,
    headPose: null,
    gazeDivergence: null,
    mouthAspectRatio: 0,
    eyesClosed: false,
    headTurned: false,
    headDown: false,
    mouthOpen: false,
    gazeDiverged: false
  }
};

export function extractFrameSignals(
  face: LandmarkPoint[] | undefined,
  settings: RuleSettings,
  timestamp: number,
  previousNose: LandmarkPoint | null,
  matrix?: readonly number[]
): FrameSignals {
  if (!face) {
    return {
      timestamp,
      facePresent: false,
      eyeAspectRatio: 0,
      headYawRatio: 0,
      headPitchRatio: 0,
      headPose: null,
      gazeDivergence: null,
      mouthAspectRatio: 0,
      eyesClosed: false,
      headTurned: false,
      headDown: false,
      mouthOpen: false,
      gazeDiverged: false
    };
  }

  const bounds = getBounds(face);
  const faceWidth = Math.max(0.001, bounds.width);
  const faceHeight = Math.max(0.001, bounds.height);
  const nose = face[1] ?? face[Math.floor(face.length / 2)];
  const leftEar = calculateEyeAspectRatio(face, [33, 160, 158, 133, 153, 144]);
  const rightEar = calculateEyeAspectRatio(face, [362, 385, 387, 263, 373, 380]);
  const eyeAspectRatio = (leftEar + rightEar) / 2;
  const mouthAspectRatio = calculateMouthAspectRatio(face);
  const eyeCenterY = averagePoints(face, [33, 133, 362, 263]).y;
  const faceCenterX = bounds.left + faceWidth / 2;
  const headYawRatio = (nose.x - faceCenterX) / faceWidth;
  const headPitchRatio = (nose.y - eyeCenterY) / faceHeight;
  const headPose = headPoseFromMatrix(matrix);
  const gazeDivergence = gazeDivergenceDegrees(face);
  const frame = { headYawRatio, headPitchRatio, headPose };
  // Widen the turn threshold slightly while the head is in motion, so a quick
  // glance that passes through a wide angle is not counted as turning away.
  const motionBoost = previousNose === null ? 0 : distance(nose, previousNose) > 0.018 ? 1 : 0;

  return {
    timestamp,
    facePresent: true,
    eyeAspectRatio,
    headYawRatio,
    headPitchRatio,
    headPose,
    gazeDivergence,
    mouthAspectRatio,
    eyesClosed: eyeAspectRatio < settings.eyeAspectRatioThreshold,
    headTurned:
      Math.abs(frameYawDegrees(frame)) > settings.headTurnDegreesThreshold + motionBoost,
    headDown: framePitchDegrees(frame) > settings.headDownDegreesThreshold,
    mouthOpen: mouthAspectRatio > settings.mouthAspectRatioThreshold,
    gazeDiverged:
      gazeDivergence !== null &&
      Math.abs(gazeDivergence) > settings.gazeDivergenceDegreesThreshold
  };
}

export function updateSignalWindow(
  windowFrames: FrameSignals[],
  nextFrame: FrameSignals,
  settings: RuleSettings
) {
  const earliest = nextFrame.timestamp - settings.windowSeconds * 1000;
  return [...windowFrames, nextFrame].filter((frame) => frame.timestamp >= earliest);
}

export function classifyFocus(windowFrames: FrameSignals[], settings: RuleSettings): FocusSnapshot {
  const latest = windowFrames.at(-1);

  if (!latest) {
    return emptyFocusSnapshot;
  }

  const durations = {
    face_missing: getLatestDuration(windowFrames, (frame) => !frame.facePresent),
    eyes_closed: getLatestDuration(windowFrames, (frame) => frame.eyesClosed),
    head_turned: getLatestDuration(windowFrames, (frame) => frame.headTurned),
    head_down: getLatestDuration(windowFrames, (frame) => frame.headDown),
    yawning: getLatestDuration(windowFrames, (frame) => frame.mouthOpen),
    gaze_diverged: getLatestDuration(windowFrames, (frame) => frame.gazeDiverged)
  };
  const activeSignals: FocusSignalName[] = [];
  let penalty = 0;

  if (!latest.facePresent && durations.face_missing >= settings.faceMissingSeconds) {
    activeSignals.push('face_missing');
    penalty += settings.faceMissingPenalty;
  }
  if (durations.eyes_closed >= settings.eyesClosedSeconds) {
    activeSignals.push('eyes_closed');
    penalty += settings.eyesClosedPenalty;
  }
  if (durations.head_turned >= settings.headTurnedSeconds) {
    activeSignals.push('head_turned');
    penalty += settings.headTurnedPenalty;
  }
  if (durations.head_down >= settings.headDownSeconds) {
    activeSignals.push('head_down');
    penalty += settings.headDownPenalty;
  }
  if (durations.yawning >= settings.yawningSeconds) {
    activeSignals.push('yawning');
    penalty += settings.yawningPenalty;
  }
  if (durations.gaze_diverged >= settings.gazeDivergedSeconds) {
    activeSignals.push('gaze_diverged');
    penalty += settings.gazeDivergedPenalty;
  }

  const score = clamp(Math.round(100 - penalty), 0, 100);
  const label = getFocusLabel(score, activeSignals, settings);

  return {
    label,
    score,
    activeSignals,
    durations,
    blinksPerMinute: getBlinksPerMinute(windowFrames, settings),
    yawnCount: countSignalRuns(windowFrames, (frame) => frame.mouthOpen, {
      minSeconds: settings.yawningSeconds
    }),
    // Frames with no face are dropped first: the jump between the last seen pose
    // and the pose found after the gap is not movement anyone made.
    motionAmount: getMotionAmount(windowFrames.filter((frame) => frame.facePresent)),
    current: {
      facePresent: latest.facePresent,
      eyeAspectRatio: latest.eyeAspectRatio,
      headYawRatio: latest.headYawRatio,
      headPitchRatio: latest.headPitchRatio,
      headPose: latest.headPose,
      gazeDivergence: latest.gazeDivergence,
      mouthAspectRatio: latest.mouthAspectRatio,
      mouthOpen: latest.mouthOpen,
      eyesClosed: latest.eyesClosed,
      headTurned: latest.headTurned,
      headDown: latest.headDown,
      gazeDiverged: latest.gazeDiverged
    }
  };
}

export function buildFeatureWindow(
  windowFrames: FrameSignals[],
  ruleSnapshot: FocusSnapshot,
  windowStart: number,
  windowEnd: number,
  identity: FocusIdentity
): FeatureWindowV1 {
  const durationSec = clamp(round((windowEnd - windowStart) / 1000, 1), 5, 60);
  const frames = windowFrames.length > 0 ? windowFrames : [];
  const detectedFrames = frames.filter((frame) => frame.facePresent);
  const facePresenceRatio = ratio(detectedFrames.length, frames.length);
  const eyeClosedRatio = ratio(
    detectedFrames.filter((frame) => frame.eyesClosed).length,
    detectedFrames.length
  );
  const headDownRatio = ratio(
    detectedFrames.filter((frame) => frame.headDown).length,
    detectedFrames.length
  );
  const headTurnedRatio = ratio(
    detectedFrames.filter((frame) => frame.headTurned).length,
    detectedFrames.length
  );
  const headYawDegrees = detectedFrames.map((frame) => frameYawDegrees(frame));
  const headPitchDegrees = detectedFrames.map((frame) => framePitchDegrees(frame));
  const motionAmount = getMotionAmount(detectedFrames);
  const ruleScore = clamp(ruleSnapshot.score / 100, 0, 1);
  const windowEndDate = new Date();
  const windowStartDate = new Date(windowEndDate.getTime() - durationSec * 1000);

  return {
    windowId: cryptoRandomId(),
    userId: identity.userId,
    sessionId: identity.sessionId,
    windowStart: windowStartDate.toISOString(),
    windowEnd: windowEndDate.toISOString(),
    durationSec,
    features: {
      facePresenceRatio,
      avgFaceDetectionConfidence: facePresenceRatio,
      eyeClosedRatio,
      headYawMean: round(mean(headYawDegrees), 3),
      headYawStd: round(populationStd(headYawDegrees), 3),
      headPitchMean: round(mean(headPitchDegrees), 3),
      headPitchStd: round(populationStd(headPitchDegrees), 3),
      headDownRatio,
      headTurnedRatio,
      lowConfidenceRatio: round(1 - facePresenceRatio, 3),
      motionAmount,
      ruleBasedScoreMean: ruleScore,
      ruleBasedScoreMin: ruleScore
    },
    ruleBasedLabel: toMlFocusLabel(ruleSnapshot.label)
  };
}

export function focusSnapshotFromMl(
  response: PredictResponse,
  fallback: FocusSnapshot
): FocusSnapshot {
  return {
    ...fallback,
    label: fromMlFocusLabel(response.label),
    score: Math.round(clamp(response.score, 0, 1) * 100)
  };
}

export function toMlFocusLabel(label: FocusLabel): MlFocusLabel {
  if (label === 'away') {
    return 'away';
  }

  if (label === 'sleepy' || label === 'paused') {
    return 'break_or_paused';
  }

  if (label === 'distracted' || label === 'uncertain') {
    return 'distracted';
  }

  return 'focused';
}

export function fromMlFocusLabel(label: MlFocusLabel): FocusLabel {
  if (label === 'break_or_paused') {
    return 'sleepy';
  }

  return label;
}

export function getFocusLabel(
  score: number,
  activeSignals: FocusSignalName[],
  settings: RuleSettings
): FocusLabel {
  if (activeSignals.includes('face_missing')) {
    return 'away';
  }

  if (activeSignals.includes('eyes_closed')) {
    return 'sleepy';
  }

  if (
    activeSignals.includes('head_turned') ||
    activeSignals.includes('head_down') ||
    activeSignals.includes('gaze_diverged') ||
    score < settings.focusedThreshold
  ) {
    return score >= settings.focusedThreshold - 10 ? 'uncertain' : 'distracted';
  }

  return 'focused';
}

export function getLatestDuration(
  windowFrames: FrameSignals[],
  predicate: (frame: FrameSignals) => boolean
) {
  const latest = windowFrames.at(-1);

  if (!latest || !predicate(latest)) {
    return 0;
  }

  let start = latest.timestamp;

  for (let index = windowFrames.length - 1; index >= 0; index -= 1) {
    const frame = windowFrames[index];
    if (!predicate(frame)) {
      break;
    }
    start = frame.timestamp;
  }

  return round((latest.timestamp - start) / 1000, 1);
}

type HeadAngleSource = Pick<FrameSignals, 'headYawRatio' | 'headPitchRatio' | 'headPose'>;

/**
 * The real 6DoF pose is the source of truth for head angle: unlike the landmark
 * ratios it does not drift when the face sits off-centre or close to the camera.
 * The scaled ratio is only a fallback for frames MediaPipe gave no matrix for.
 */
function frameYawDegrees(frame: HeadAngleSource) {
  return frame.headPose?.headYaw ?? frame.headYawRatio * 90;
}

function framePitchDegrees(frame: HeadAngleSource) {
  return frame.headPose?.headPitch ?? frame.headPitchRatio * 90;
}

/** Stays on the landmark ratios: motionAmount is a relative jitter measure and
 * rescaling it would shift a feature the ML model already sees. */
export function getMotionAmount(frames: FrameSignals[]) {
  if (frames.length < 2) {
    return 0;
  }

  const deltas = frames.slice(1).map((frame, index) => {
    const previous = frames[index];
    return Math.hypot(
      frame.headYawRatio - previous.headYawRatio,
      frame.headPitchRatio - previous.headPitchRatio
    );
  });

  return round(mean(deltas) * 100, 3);
}

/**
 * Counts completed runs of `predicate` inside the window, optionally bounded by
 * how long each run lasted. The trailing run is excluded: it is still going, so
 * its duration is not known yet and counting it would double-count on the next
 * frame.
 */
export function countSignalRuns(
  frames: FrameSignals[],
  predicate: (frame: FrameSignals) => boolean,
  bounds: { minSeconds?: number; maxSeconds?: number } = {}
) {
  const minSeconds = bounds.minSeconds ?? 0;
  const maxSeconds = bounds.maxSeconds ?? Infinity;
  let runs = 0;
  let runStart: number | null = null;

  frames.forEach((frame, index) => {
    if (predicate(frame)) {
      runStart ??= frame.timestamp;
      return;
    }

    if (runStart === null) {
      return;
    }

    const runSeconds = (frames[index - 1]!.timestamp - runStart) / 1000;
    if (runSeconds >= minSeconds && runSeconds <= maxSeconds) {
      runs += 1;
    }
    runStart = null;
  });

  return runs;
}

export function getBlinksPerMinute(frames: FrameSignals[], settings: RuleSettings) {
  const windowSeconds = getWindowSeconds(frames);

  if (windowSeconds <= 0) {
    return 0;
  }

  const blinks = countSignalRuns(frames, (frame) => frame.eyesClosed, {
    maxSeconds: settings.blinkMaxSeconds
  });
  return round((blinks / windowSeconds) * 60, 1);
}

function getWindowSeconds(frames: FrameSignals[]) {
  const first = frames.at(0);
  const last = frames.at(-1);
  return first && last ? (last.timestamp - first.timestamp) / 1000 : 0;
}

/**
 * Vertical lip gap over mouth width, using the inner lip landmarks so lip
 * thickness does not shift the ratio.
 */
export function calculateMouthAspectRatio(face: LandmarkPoint[]) {
  const upperLip = face[13];
  const lowerLip = face[14];
  const leftCorner = face[61];
  const rightCorner = face[291];

  if (!upperLip || !lowerLip || !leftCorner || !rightCorner) {
    return 0;
  }

  return distance(upperLip, lowerLip) / Math.max(0.001, distance(leftCorner, rightCorner));
}

export function calculateEyeAspectRatio(
  face: LandmarkPoint[],
  indices: [number, number, number, number, number, number]
) {
  const [left, upperLeft, upperRight, right, lowerRight, lowerLeft] = indices.map(
    (index) => face[index]
  );

  if (!left || !upperLeft || !upperRight || !right || !lowerRight || !lowerLeft) {
    return 1;
  }

  const verticalA = distance(upperLeft, lowerLeft);
  const verticalB = distance(upperRight, lowerRight);
  const horizontal = distance(left, right);
  return (verticalA + verticalB) / (2 * Math.max(0.001, horizontal));
}

export function getBounds(points: LandmarkPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
}

export function averagePoints(face: LandmarkPoint[], indices: number[]) {
  const points = indices.map((index) => face[index]).filter(Boolean);

  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

export function distance(a: LandmarkPoint, b: LandmarkPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? round(clamp(numerator / denominator, 0, 1), 3) : 0;
}

export function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function populationStd(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function cryptoRandomId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `window-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
