/**
 * Head orientation from MediaPipe's 4x4 facial transformation matrix, shared by
 * the focus pipeline and the face-party expression pipeline so both read the same
 * angles from the same decomposition.
 */

export type HeadPose = {
  /** Degrees. Left/right rotation. */
  headYaw: number;
  /** Degrees. Up/down rotation. */
  headPitch: number;
  /** Degrees. Head tilt toward a shoulder. */
  headRoll: number;
};

export const neutralHeadPose: HeadPose = { headYaw: 0, headPitch: 0, headRoll: 0 };

/**
 * Returns null rather than a neutral pose when the matrix is missing: a silent
 * zero reads as "looking straight at the camera" and would turn a detection gap
 * into a focused verdict.
 */
export function headPoseFromMatrix(matrix?: readonly number[]): HeadPose | null {
  if (!matrix || matrix.length < 16) {
    return null;
  }

  // Column-major, so element (row, col) is matrix[col * 4 + row].
  const yaw = Math.atan2(matrix[8] ?? 0, matrix[0] ?? 1);
  const pitch = Math.atan2(-(matrix[9] ?? 0), matrix[10] ?? 1);
  const roll = Math.atan2(matrix[4] ?? 0, matrix[5] ?? 1);

  return {
    headYaw: radiansToDegrees(yaw),
    headPitch: radiansToDegrees(pitch),
    headRoll: radiansToDegrees(roll)
  };
}

export function roundHeadPose(pose: HeadPose): HeadPose {
  return {
    headYaw: normalizeZero(Math.round(pose.headYaw)),
    headPitch: normalizeZero(Math.round(pose.headPitch)),
    headRoll: normalizeZero(Math.round(pose.headRoll))
  };
}

function radiansToDegrees(value: number) {
  return normalizeZero((value * 180) / Math.PI);
}

/** A head facing straight ahead yields atan2(-0, 1) === -0; keep that out of the
 * angles so features and displays never carry a negative zero. */
function normalizeZero(value: number) {
  return value === 0 ? 0 : value;
}
