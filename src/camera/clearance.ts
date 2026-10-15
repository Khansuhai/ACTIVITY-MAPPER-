import { metersPerPixel } from './camera';
import { gaussianSmooth } from './smooth';

/** Terrain height in metres at a point, or null where unknown. */
export type ElevationFn = (lon: number, lat: number) => number | null;

export interface ClearanceInput {
  /** Route length in metres. */
  length: number;
  /** Where the camera looks at a distance along the route. */
  center(distance: number): [lon: number, lat: number];
  /** Camera bearing (degrees) at a distance. */
  heading(distance: number): number;
  elevationAt: ElevationFn;
  exaggeration: number;
  /** CSS height of the viewport; with zoom, it sets how far the camera is from the target. */
  viewportHeight: number;
  zoom: number;
  /** The usual pitch; lowered only where terrain would block the view. */
  pitch: number;
  minPitch?: number;
}

/** MapLibre's default vertical field of view is 36.87°: camera distance = 1.5 × viewport height. */
const CAMERA_DISTANCE_PER_HEIGHT = 0.5 / Math.tan(((36.8699 / 2) * Math.PI) / 180);
/** The sight line must clear the terrain by this much (metres). */
const MARGIN_M = 25;
const PITCH_STEP = 2.5;
const SIGHT_SAMPLES = 24;

/**
 * Pitch along the route that keeps the marker visible: where a ridge behind the marker would
 * block the camera's line of sight, the camera tilts down (looks more from above) just enough.
 * The result is widened (a running minimum) and Gaussian-smoothed over distance, so the camera
 * starts tilting before the ridge and never jumps. Pure: the elevation function is passed in,
 * so preview, export and tests agree (DECISIONS.md, D30).
 */
export function pitchProfile(input: ClearanceInput): (distance: number) => number {
  const { length, pitch } = input;
  const minPitch = input.minPitch ?? 25;
  if (length <= 0) return () => pitch;
  const step = Math.max(20, length / 2500);
  const count = Math.ceil(length / step) + 1;
  const spacing = length / (count - 1);

  const raw = new Float64Array(count);
  for (let k = 0; k < count; k++) raw[k] = clearPitch(input, k * spacing, minPitch);

  // Running minimum over ±500 m: tilt down a little before and after the obstruction...
  const reach = Math.max(1, Math.round(500 / spacing));
  const widened = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    let m = pitch;
    for (let j = Math.max(0, k - reach); j <= Math.min(count - 1, k + reach); j++)
      m = Math.min(m, raw[j]!);
    widened[k] = m;
  }
  // ...then smooth, so the tilt eases in and out.
  const smooth = gaussianSmooth(widened, 300 / spacing);

  return (distance) => {
    const x = Math.min(length, Math.max(0, distance)) / spacing;
    const k = Math.min(Math.floor(x), count - 2);
    const f = x - k;
    return Math.min(pitch, smooth[k]! + (smooth[k + 1]! - smooth[k]!) * f);
  };
}

/** The highest pitch (≤ input.pitch) from which the target is visible, or minPitch. */
function clearPitch(input: ClearanceInput, distance: number, minPitch: number): number {
  const [lon, lat] = input.center(distance);
  const targetGround = input.elevationAt(lon, lat);
  if (targetGround === null) return input.pitch;
  const target = targetGround * input.exaggeration;
  const camDist =
    CAMERA_DISTANCE_PER_HEIGHT * input.viewportHeight * metersPerPixel(input.zoom, lat);
  const back = ((input.heading(distance) + 180) * Math.PI) / 180;
  const mPerDegLat = 111_195;
  const mPerDegLon = mPerDegLat * Math.cos((lat * Math.PI) / 180);

  for (let p = input.pitch; p >= minPitch; p -= PITCH_STEP) {
    const rad = (p * Math.PI) / 180;
    const horizontal = camDist * Math.sin(rad);
    const height = camDist * Math.cos(rad);
    let blocked = false;
    for (let i = 1; i < SIGHT_SAMPLES && !blocked; i++) {
      const f = i / SIGHT_SAMPLES; // 0 = target, 1 = camera
      const ground = input.elevationAt(
        lon + (Math.sin(back) * horizontal * f) / mPerDegLon,
        lat + (Math.cos(back) * horizontal * f) / mPerDegLat,
      );
      if (ground !== null && ground * input.exaggeration > target + height * f - MARGIN_M) {
        blocked = true;
      }
    }
    if (!blocked) return p;
  }
  return minPitch;
}
