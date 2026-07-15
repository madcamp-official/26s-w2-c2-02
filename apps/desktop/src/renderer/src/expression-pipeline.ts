import type { ExpressionSignals, HiddenMissionVerify, MissionResult } from '@roomi/shared';
import { headPoseFromMatrix, neutralHeadPose, roundHeadPose } from './head-pose';

export type BlendshapeCategory = {
  categoryName: string;
  score: number;
};

export type ExpressionSettings = {
  smileThreshold: number;
  jawOpenThreshold: number;
  blinkThreshold: number;
  winkOpenThreshold: number;
  browThreshold: number;
  browReleaseThreshold: number;
  cheekPuffThreshold: number;
  mouthPuckerThreshold: number;
  nodPitchThreshold: number;
  nodReleaseThreshold: number;
  missionCountCooldownMs: number;
};

export type MissionCounterState = {
  count: number;
  previousActive: boolean;
  lastCountedAt?: number;
  failed?: boolean;
};

export const defaultExpressionSettings: ExpressionSettings = {
  smileThreshold: 0.45,
  jawOpenThreshold: 0.45,
  blinkThreshold: 0.42,
  winkOpenThreshold: 0.25,
  browThreshold: 0.52,
  browReleaseThreshold: 0.25,
  cheekPuffThreshold: 0.35,
  mouthPuckerThreshold: 0.45,
  nodPitchThreshold: 12,
  nodReleaseThreshold: 5,
  missionCountCooldownMs: 1_000
};

export function expressionSignalsFromBlendshapes(
  categories: BlendshapeCategory[] | undefined,
  matrix?: readonly number[],
  timestamp = Date.now(),
  settings = defaultExpressionSettings
): ExpressionSignals {
  const score = scoreReader(categories);
  const eyeBlinkLeft = score('eyeBlinkLeft');
  const eyeBlinkRight = score('eyeBlinkRight');
  const browRaise = Math.max(
    score('browInnerUp'),
    score('browOuterUpLeft'),
    score('browOuterUpRight')
  );

  return {
    timestamp,
    smile: Math.max(score('mouthSmileLeft'), score('mouthSmileRight')),
    jawOpen: score('jawOpen'),
    winkLeft: eyeBlinkLeft >= settings.blinkThreshold && eyeBlinkRight <= settings.winkOpenThreshold,
    winkRight: eyeBlinkRight >= settings.blinkThreshold && eyeBlinkLeft <= settings.winkOpenThreshold,
    browRaise,
    cheekPuff: Math.max(score('cheekPuff'), score('cheekPuffLeft'), score('cheekPuffRight')),
    mouthPucker: score('mouthPucker'),
    ...roundHeadPose(headPoseFromMatrix(matrix) ?? neutralHeadPose)
  };
}

export function updateHiddenMissionCounter(
  state: MissionCounterState,
  verify: HiddenMissionVerify,
  target: number,
  signals: ExpressionSignals,
  settings = defaultExpressionSettings
): MissionCounterState {
  const active = expressionMissionActive(state, verify, signals, settings);

  const cooldownPassed =
    state.lastCountedAt === undefined ||
    signals.timestamp - state.lastCountedAt >= settings.missionCountCooldownMs;
  const shouldCount = active && !state.previousActive && cooldownPassed;
  const count = shouldCount ? state.count + 1 : state.count;
  return {
    count,
    previousActive: active,
    lastCountedAt: shouldCount ? signals.timestamp : state.lastCountedAt,
    failed: state.failed || count < 0 || target < 0
  };
}

function expressionMissionActive(
  state: MissionCounterState,
  verify: HiddenMissionVerify,
  signals: ExpressionSignals,
  settings: ExpressionSettings
) {
  if (verify === 'wink_count') return signals.winkLeft || signals.winkRight;
  if (verify === 'smile_count') return signals.smile >= settings.smileThreshold;
  if (verify === 'jaw_open_count') return signals.jawOpen >= settings.jawOpenThreshold;
  if (verify === 'nod_count') {
    return state.previousActive
      ? signals.headPitch > settings.nodReleaseThreshold
      : signals.headPitch >= settings.nodPitchThreshold;
  }
  if (verify !== 'brow_count') return false;

  if (state.previousActive) {
    return signals.browRaise > settings.browReleaseThreshold;
  }

  return signals.browRaise >= settings.browThreshold;
}

export function missionResultFromCounter(input: {
  playerId: string;
  missionId: string;
  verify: HiddenMissionVerify;
  target: number;
  state: MissionCounterState;
}): MissionResult {
  return {
    playerId: input.playerId,
    missionId: input.missionId,
    count: input.state.count,
    success: input.state.count >= input.target
  };
}

function scoreReader(categories: BlendshapeCategory[] | undefined) {
  const scores = new Map(categories?.map((item) => [item.categoryName, item.score]) ?? []);
  return (name: string) => scores.get(name) ?? 0;
}
