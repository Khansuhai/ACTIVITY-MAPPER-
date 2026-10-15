import type { CameraState } from './camera';

/**
 * Camera styles ("multi-angle" videos). Each is a pure function of distance travelled, applied
 * on top of the smoothed chase camera, so preview and export stay identical.
 *
 * - chase: behind the marker, looking ahead (the default since Phase 2)
 * - drone: higher and further back, a calmer overview of the terrain around you
 * - cinematic: keeps changing angle: slow side sweeps left and right, a little zoom and tilt
 *   breathing, and a wide swing around each highlight (summit, fastest km, notes)
 */
export type CameraStyle = 'chase' | 'drone' | 'cinematic';

export const CAMERA_STYLES: readonly CameraStyle[] = ['chase', 'drone', 'cinematic'];

export const CAMERA_STYLE_NAMES: Record<CameraStyle, string> = {
  chase: 'Chase',
  drone: 'Drone',
  cinematic: 'Cinematic (multi-angle)',
};

export interface StyleContext {
  /** Route length in metres. */
  length: number;
  /** Distances (m) of highlights the cinematic camera swings around. */
  highlights: readonly number[];
}

/** Side-sweep amplitude in degrees for the cinematic style. */
export const SWEEP_DEG = 50;
/** Extra swing around a highlight, in degrees. */
export const HIGHLIGHT_SWING_DEG = 120;
/** Gaussian width (m) of the swing around a highlight. */
const HIGHLIGHT_SIGMA_M = 350;

/** The style's camera at a distance, from the chase camera there. */
export function styleCamera(
  style: CameraStyle,
  chase: CameraState,
  distance: number,
  ctx: StyleContext,
): CameraState {
  if (style === 'drone') {
    return {
      ...chase,
      zoom: chase.zoom - 1.2,
      pitch: Math.min(chase.pitch, 45),
      offsetY: 0.08,
    };
  }
  if (style === 'cinematic') {
    // One full left-right sweep every third of the route (between 2 and 8 km).
    const period = Math.min(8000, Math.max(2000, ctx.length / 3));
    const phase = (2 * Math.PI * distance) / period;
    const sweep = SWEEP_DEG * Math.sin(phase);
    const swing = ctx.highlights.reduce(
      (sum, h) =>
        sum + HIGHLIGHT_SWING_DEG * Math.exp(-(((distance - h) / HIGHLIGHT_SIGMA_M) ** 2) / 2),
      0,
    );
    const breathe = Math.sin(phase / 2) ** 2; // 0..1, slower than the sweep
    return {
      ...chase,
      bearing: chase.bearing + sweep + swing,
      // Tilt down a little as the camera swings out to the side; never above the terrain-safe
      // pitch computed for the chase camera.
      pitch: Math.min(chase.pitch, 60 - 10 * breathe),
      zoom: chase.zoom - 0.4 * breathe,
    };
  }
  return chase;
}
