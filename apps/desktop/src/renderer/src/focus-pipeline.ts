import type { FeatureWindowV1, MlFocusLabel, PredictResponse } from './focus-ml-client';
import { headPoseFromMatrix, type HeadPose } from './head-pose';

/**
 * Local focus estimation shared by the MediaPipe tuning screen and the study
 * room session. Everything here is pure: landmarks in, focus label out. The
 * camera lifecycle lives in `use-focus-detection`, so thresholds tuned on the
 * test screen apply unchanged to a real session.
 */

export type FocusLabel = 'focused' | 'distracted' | 'away' | 'sleepy' | 'uncertain' | 'paused';

export type FocusSignalName = 'face_missing' | 'eyes_closed' | 'head_turned' | 'head_down';

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
  headTurnRatioThreshold: number;
  headDownRatioThreshold: number;
  faceMissingPenalty: number;
  eyesClosedPenalty: number;
  headTurnedPenalty: number;
  headDownPenalty: number;
};

export type FrameSignals = {
  timestamp: number;
  facePresent: boolean;
  eyeAspectRatio: number;
  headYawRatio: number;
  headPitchRatio: number;
  /**
   * Real 6DoF angles when MediaPipe supplied a transformation matrix. The rule
   * thresholds above still run on the landmark ratios they were tuned against;
   * this is what the ML feature window reports and what the tuning screen shows,
   * and it is the input a future degree-based rule should switch to.
   */
  headPose: HeadPose | null;
  eyesClosed: boolean;
  headTurned: boolean;
  headDown: boolean;
};

export type FocusSnapshot = {
  label: FocusLabel;
  score: number;
  activeSignals: FocusSignalName[];
  durations: Record<FocusSignalName, number>;
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
  headTurnedSeconds: 10,
  headDownSeconds: 10,
  eyeAspectRatioThreshold: 0.19,
  headTurnRatioThreshold: 0.18,
  headDownRatioThreshold: 0.36,
  faceMissingPenalty: 70,
  eyesClosedPenalty: 45,
  headTurnedPenalty: 30,
  headDownPenalty: 35
};

export const emptyFocusSnapshot: FocusSnapshot = {
  label: 'paused',
  score: 0,
  activeSignals: ['face_missing'],
  durations: {
    face_missing: 0,
    eyes_closed: 0,
    head_turned: 0,
    head_down: 0
  },
  current: {
    facePresent: false,
    eyeAspectRatio: 0,
    headYawRatio: 0,
    headPitchRatio: 0,
    headPose: null,
    eyesClosed: false,
    headTurned: false,
    headDown: false
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
      eyesClosed: false,
      headTurned: false,
      headDown: false
    };
  }

  const bounds = getBounds(face);
  const faceWidth = Math.max(0.001, bounds.width);
  const faceHeight = Math.max(0.001, bounds.height);
  const nose = face[1] ?? face[Math.floor(face.length / 2)];
  const leftEar = calculateEyeAspectRatio(face, [33, 160, 158, 133, 153, 144]);
  const rightEar = calculateEyeAspectRatio(face, [362, 385, 387, 263, 373, 380]);
  const eyeAspectRatio = (leftEar + rightEar) / 2;
  const eyeCenterY = averagePoints(face, [33, 133, 362, 263]).y;
  const faceCenterX = bounds.left + faceWidth / 2;
  const headYawRatio = (nose.x - faceCenterX) / faceWidth;
  const headPitchRatio = (nose.y - eyeCenterY) / faceHeight;
  const motionBoost =
    previousNose === null ? 0 : distance(nose, previousNose) > 0.018 ? 0.01 : 0;

  return {
    timestamp,
    facePresent: true,
    eyeAspectRatio,
    headYawRatio,
    headPitchRatio,
    headPose: headPoseFromMatrix(matrix),
    eyesClosed: eyeAspectRatio < settings.eyeAspectRatioThreshold,
    headTurned: Math.abs(headYawRatio) > settings.headTurnRatioThreshold + motionBoost,
    headDown: headPitchRatio > settings.headDownRatioThreshold
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
    head_down: getLatestDuration(windowFrames, (frame) => frame.headDown)
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

  const score = clamp(Math.round(100 - penalty), 0, 100);
  const label = getFocusLabel(score, activeSignals, settings);

  return {
    label,
    score,
    activeSignals,
    durations,
    current: {
      facePresent: latest.facePresent,
      eyeAspectRatio: latest.eyeAspectRatio,
      headYawRatio: latest.headYawRatio,
      headPitchRatio: latest.headPitchRatio,
      headPose: latest.headPose,
      eyesClosed: latest.eyesClosed,
      headTurned: latest.headTurned,
      headDown: latest.headDown
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

/**
 * The `FeatureWindowV1` schema promises degrees, so prefer the real pose and only
 * fall back to scaling the landmark ratio when no matrix was available.
 */
function frameYawDegrees(frame: FrameSignals) {
  return frame.headPose?.headYaw ?? frame.headYawRatio * 90;
}

function framePitchDegrees(frame: FrameSignals) {
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
