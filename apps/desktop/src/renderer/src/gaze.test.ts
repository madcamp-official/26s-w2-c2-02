import { describe, expect, it } from 'vitest';
import { gazeDivergenceDegrees } from './gaze';
import type { LandmarkPoint } from './focus-pipeline';

/**
 * Builds a mesh with both eyes level and 0.1 wide, then slides each iris by
 * `offsetInEyeWidths` along the socket. `points` controls whether the mesh has
 * iris landmarks at all, which is the difference between the 478- and 468-point
 * models.
 */
function faceWithGaze(offsetInEyeWidths: number, points = 478): LandmarkPoint[] {
  const face: LandmarkPoint[] = Array.from({ length: points }, () => ({ x: 0.5, y: 0.5 }));
  const eyes: [number, number, number][] = [
    [33, 133, 468],
    [362, 263, 473]
  ];

  eyes.forEach(([outer, inner, iris], index) => {
    const left = 0.3 + index * 0.3;
    face[outer] = { x: left, y: 0.5 };
    face[inner] = { x: left + 0.1, y: 0.5 };

    if (points > 468) {
      face[iris] = { x: left + 0.05 + offsetInEyeWidths * 0.1, y: 0.5 };
    }
  });

  return face;
}

describe('gazeDivergenceDegrees', () => {
  it('reads zero when both irises sit centred in their sockets', () => {
    expect(gazeDivergenceDegrees(faceWithGaze(0))).toBe(0);
  });

  it('converts iris offset to an angle through the eyeball geometry', () => {
    // offset = 0.4 * sin(theta), so a fifth of an eye width is asin(0.5) = 30 degrees.
    expect(gazeDivergenceDegrees(faceWithGaze(0.2))).toBeCloseTo(30, 1);
    expect(gazeDivergenceDegrees(faceWithGaze(-0.2))).toBeCloseTo(-30, 1);
    expect(gazeDivergenceDegrees(faceWithGaze(0.1))).toBeCloseTo(14.5, 1);
  });

  it('saturates instead of returning NaN when the iris is tracked past the socket', () => {
    // asin() is undefined past 1, and a tracking glitch must not poison the window.
    expect(gazeDivergenceDegrees(faceWithGaze(0.9))).toBe(90);
  });

  it('ignores head roll by measuring along the corner-to-corner axis', () => {
    const face = faceWithGaze(0);
    // Tilt one eye 30 degrees about its own centre, iris included: the eye is
    // rolled, not looking anywhere, so divergence must stay put.
    const centre = { x: 0.35, y: 0.5 };
    const rotate = (point: LandmarkPoint) => {
      const angle = Math.PI / 6;
      const dx = point.x - centre.x;
      const dy = point.y - centre.y;
      return {
        x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle)
      };
    };
    face[33] = rotate(face[33]!);
    face[133] = rotate(face[133]!);
    face[468] = rotate(face[468]!);

    expect(gazeDivergenceDegrees(face)).toBeCloseTo(0, 4);
  });

  it('returns null for a mesh with no iris landmarks rather than guessing a centre', () => {
    // A silent 0 would read as "eyes agree with the head" and quietly turn a model
    // without iris support into a permanently focused verdict.
    expect(gazeDivergenceDegrees(faceWithGaze(0.2, 468))).toBeNull();
    expect(gazeDivergenceDegrees(undefined)).toBeNull();
  });
});
