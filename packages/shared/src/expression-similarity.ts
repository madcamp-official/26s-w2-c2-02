import type { ExpressionSignals } from './types';

const INTENSITY_FIELDS = ['smile', 'jawOpen', 'browRaise', 'cheekPuff', 'mouthPucker'] as const;
const BOOLEAN_FIELDS = ['winkLeft', 'winkRight'] as const;
const ANGLE_FIELDS = ['headYaw', 'headPitch', 'headRoll'] as const;

// Head rotation signals swing roughly +/-45deg in normal use; beyond that the
// face is turning away from the camera rather than expressing something.
const ANGLE_RANGE_DEGREES = 45;

/**
 * Compares two captured expression snapshots and returns how alike they are,
 * from 0 (nothing alike) to 1 (identical). Used to score how well a copycat
 * relay participant reproduced the previous participant's expression.
 */
export function compareExpressionSignals(
  target: ExpressionSignals,
  attempt: ExpressionSignals
): number {
  const fieldDistances: number[] = [];

  for (const field of INTENSITY_FIELDS) {
    fieldDistances.push(Math.abs(target[field] - attempt[field]));
  }

  for (const field of BOOLEAN_FIELDS) {
    fieldDistances.push(target[field] === attempt[field] ? 0 : 1);
  }

  for (const field of ANGLE_FIELDS) {
    const distance = Math.abs(target[field] - attempt[field]) / ANGLE_RANGE_DEGREES;
    fieldDistances.push(Math.min(1, distance));
  }

  const meanDistance = fieldDistances.reduce((sum, value) => sum + value, 0) / fieldDistances.length;
  return Math.max(0, Math.min(1, 1 - meanDistance));
}
