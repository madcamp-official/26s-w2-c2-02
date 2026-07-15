import { describe, expect, it } from 'vitest';
import { headPoseFromMatrix, roundHeadPose } from './head-pose';

/** Packs a 3x3 rotation into MediaPipe's column-major 4x4 layout. */
function matrixFrom(rotation: number[][]): number[] {
  const matrix = new Array(16).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      matrix[column * 4 + row] = rotation[row][column];
    }
  }
  matrix[15] = 1;
  return matrix;
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function yawRotation(degrees: number) {
  const angle = radians(degrees);
  return [
    [Math.cos(angle), 0, Math.sin(angle)],
    [0, 1, 0],
    [-Math.sin(angle), 0, Math.cos(angle)]
  ];
}

function pitchRotation(degrees: number) {
  const angle = radians(degrees);
  return [
    [1, 0, 0],
    [0, Math.cos(angle), -Math.sin(angle)],
    [0, Math.sin(angle), Math.cos(angle)]
  ];
}

function rollRotation(degrees: number) {
  const angle = radians(degrees);
  return [
    [Math.cos(angle), -Math.sin(angle), 0],
    [Math.sin(angle), Math.cos(angle), 0],
    [0, 0, 1]
  ];
}

describe('headPoseFromMatrix', () => {
  it('reports null when no matrix is available', () => {
    expect(headPoseFromMatrix(undefined)).toBeNull();
    expect(headPoseFromMatrix([1, 0, 0])).toBeNull();
  });

  it('reads an identity matrix as facing straight ahead', () => {
    const pose = headPoseFromMatrix(matrixFrom([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]));

    expect(roundHeadPose(pose!)).toEqual({ headYaw: 0, headPitch: 0, headRoll: 0 });
  });

  it('recovers a yaw rotation without leaking into the other axes', () => {
    const pose = headPoseFromMatrix(matrixFrom(yawRotation(30)));

    expect(roundHeadPose(pose!)).toEqual({ headYaw: 30, headPitch: 0, headRoll: 0 });
  });

  it('recovers a pitch rotation without leaking into the other axes', () => {
    const pose = headPoseFromMatrix(matrixFrom(pitchRotation(20)));

    expect(roundHeadPose(pose!)).toEqual({ headYaw: 0, headPitch: 20, headRoll: 0 });
  });

  it('recovers roll with an inverted sign', () => {
    // Documents an existing quirk of this decomposition rather than endorsing it:
    // a +15 degree rotation about Z reads back as -15. Focus rules ignore roll, so
    // this is pinned here to be fixed deliberately if roll ever gets a consumer.
    const pose = headPoseFromMatrix(matrixFrom(rollRotation(15)));

    expect(roundHeadPose(pose!)).toEqual({ headYaw: 0, headPitch: 0, headRoll: -15 });
  });

  it('keeps sub-degree precision so angle spread stays measurable', () => {
    const pose = headPoseFromMatrix(matrixFrom(yawRotation(12.4)));

    expect(pose?.headYaw).toBeCloseTo(12.4, 5);
  });
});
