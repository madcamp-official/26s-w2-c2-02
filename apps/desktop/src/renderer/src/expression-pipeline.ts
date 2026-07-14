import type { ExpressionSignals, HiddenMissionVerify, MissionResult } from '@roomi/shared';

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
  cheekPuffThreshold: number;
  mouthPuckerThreshold: number;
};

export type MissionCounterState = {
  count: number;
  previousActive: boolean;
  failed?: boolean;
};

export const defaultExpressionSettings: ExpressionSettings = {
  smileThreshold: 0.45,
  jawOpenThreshold: 0.45,
  blinkThreshold: 0.55,
  winkOpenThreshold: 0.25,
  browThreshold: 0.42,
  cheekPuffThreshold: 0.35,
  mouthPuckerThreshold: 0.45
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
    ...headPoseFromMatrix(matrix)
  };
}

export function updateHiddenMissionCounter(
  state: MissionCounterState,
  verify: HiddenMissionVerify,
  target: number,
  signals: ExpressionSignals,
  settings = defaultExpressionSettings
): MissionCounterState {
  if (verify === 'no_jaw_open') {
    return {
      count: signals.jawOpen >= settings.jawOpenThreshold ? 1 : state.count,
      previousActive: false,
      failed: state.failed || signals.jawOpen >= settings.jawOpenThreshold
    };
  }

  const active =
    verify === 'wink_count'
      ? signals.winkLeft || signals.winkRight
      : verify === 'smile_count'
        ? signals.smile >= settings.smileThreshold
        : verify === 'brow_count'
          ? signals.browRaise >= settings.browThreshold
          : signals.cheekPuff >= settings.cheekPuffThreshold;

  const count = active && !state.previousActive ? state.count + 1 : state.count;
  return {
    count,
    previousActive: active,
    failed: state.failed || count < 0 || target < 0
  };
}

export function missionResultFromCounter(input: {
  playerId: string;
  missionId: string;
  verify: HiddenMissionVerify;
  target: number;
  state: MissionCounterState;
}): MissionResult {
  const success =
    input.verify === 'no_jaw_open'
      ? !input.state.failed
      : input.state.count >= input.target;

  return {
    playerId: input.playerId,
    missionId: input.missionId,
    count: input.state.count,
    success
  };
}

function scoreReader(categories: BlendshapeCategory[] | undefined) {
  const scores = new Map(categories?.map((item) => [item.categoryName, item.score]) ?? []);
  return (name: string) => scores.get(name) ?? 0;
}

function headPoseFromMatrix(matrix?: readonly number[]) {
  if (!matrix || matrix.length < 16) {
    return { headYaw: 0, headPitch: 0, headRoll: 0 };
  }

  const yaw = Math.atan2(matrix[8] ?? 0, matrix[0] ?? 1);
  const pitch = Math.atan2(-(matrix[9] ?? 0), matrix[10] ?? 1);
  const roll = Math.atan2(matrix[4] ?? 0, matrix[5] ?? 1);

  return {
    headYaw: radiansToDegrees(yaw),
    headPitch: radiansToDegrees(pitch),
    headRoll: radiansToDegrees(roll)
  };
}

function radiansToDegrees(value: number) {
  return Math.round((value * 180) / Math.PI);
}
