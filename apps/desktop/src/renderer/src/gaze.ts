import type { LandmarkPoint } from './focus-pipeline';

/**
 * Eye-in-socket gaze, i.e. where the eyes point relative to where the head points.
 *
 * This is the measure the "head says one thing, eyes say another" rule needs. An
 * iris centred in its socket means gaze and head agree, whatever direction the
 * head faces; an off-centre iris is exactly the angle between the two. Head
 * direction itself is a separate reading — see `head-pose.ts`.
 */

/** Iris centres in the 478-point mesh. The 468-point mesh has no iris at all. */
const irisCenterIndices = [468, 473] as const;

/** Corner pairs for the two eyes, matching the indices the EAR rules already use. */
const eyeCornerPairs: readonly (readonly [number, number])[] = [
  [33, 133],
  [362, 263]
];

/**
 * Iris travel radius over eye width. The eyeball rotates about its centre, so the
 * iris centre moves by `R * sin(theta)` across the socket: with a ~12mm rotation
 * radius and a ~30mm corner-to-corner opening, offset = 0.4 * sin(theta). This is
 * what turns a landmark ratio into an angle instead of a tuned constant.
 */
const irisTravelOverEyeWidth = 0.4;

/**
 * Degrees the eyes are turned away from where the head faces, or null when the
 * mesh carries no iris landmarks.
 *
 * Sign is image-space (mirroring the preview flips it), so callers judge the
 * magnitude. A turned head foreshortens the eye opening and inflates the reading
 * by 1/cos(yaw), which is left uncorrected: inside the +-30 degrees where a head
 * still counts as facing forward that is at most a 15% overshoot, and past it the
 * head-turned rule has already fired.
 */
export function gazeDivergenceDegrees(face: readonly LandmarkPoint[] | undefined): number | null {
  if (!face) {
    return null;
  }

  const readings = eyeCornerPairs
    .map((corners, index) => eyeGazeOffset(face[irisCenterIndices[index]], face[corners[0]], face[corners[1]]))
    .filter((offset): offset is number => offset !== null);

  if (readings.length === 0) {
    return null;
  }

  const offset = readings.reduce((sum, value) => sum + value, 0) / readings.length;
  const sine = Math.max(-1, Math.min(1, offset / irisTravelOverEyeWidth));
  return roundTo((Math.asin(sine) * 180) / Math.PI, 1);
}

/**
 * How far the iris sits from the middle of its socket, in eye widths, measured
 * along the corner-to-corner axis so head roll does not leak into the reading.
 * The axis is oriented towards +x so both eyes report the same sign without
 * depending on which landmark index happens to be the inner corner.
 */
function eyeGazeOffset(
  iris: LandmarkPoint | undefined,
  cornerA: LandmarkPoint | undefined,
  cornerB: LandmarkPoint | undefined
): number | null {
  if (!iris || !cornerA || !cornerB) {
    return null;
  }

  const [start, end] = cornerA.x <= cornerB.x ? [cornerA, cornerB] : [cornerB, cornerA];
  const width = Math.hypot(end.x - start.x, end.y - start.y);

  if (width < 1e-6) {
    return null;
  }

  const axisX = (end.x - start.x) / width;
  const axisY = (end.y - start.y) / width;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return ((iris.x - midX) * axisX + (iris.y - midY) * axisY) / width;
}

function roundTo(value: number, precision: number) {
  const multiplier = 10 ** precision;
  const rounded = Math.round(value * multiplier) / multiplier;
  // asin(-0) is -0, and a negative zero would show up as "-0도" on the tuning screen.
  return rounded === 0 ? 0 : rounded;
}
