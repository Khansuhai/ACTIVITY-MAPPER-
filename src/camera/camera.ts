import type { BBox } from '../track/geo';
import { mercator, unmercator } from '../track/sampler';
import { shortestDelta } from './smooth';

/** Everything MapLibre needs to place the camera. DOM-free, so the timeline can be unit tested. */
export interface CameraState {
  center: [lon: number, lat: number];
  zoom: number;
  pitch: number;
  bearing: number;
  /**
   * How far below the screen centre the `center` point is drawn, as a fraction of the viewport
   * height. 0.2 puts the runner in the lower part of the frame, so the camera shows what's ahead.
   */
  offsetY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** MapLibre renders 512 px tiles. */
const TILE_SIZE = 512;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** Metres per screen pixel at the given zoom and latitude, looking straight down. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom);
}

/** Pure equivalent of MapLibre's fitBounds for a top-down camera. */
export function fitBounds(
  [west, south, east, north]: BBox,
  viewport: Viewport,
  padding = 60,
  maxZoom = 16,
): { center: [number, number]; zoom: number } {
  const [x0, y1] = mercator(west, south);
  const [x1, y0] = mercator(east, north);
  const w = Math.max(x1 - x0, 1e-9);
  const h = Math.max(y1 - y0, 1e-9);
  const availW = Math.max(viewport.width - 2 * padding, 1);
  const availH = Math.max(viewport.height - 2 * padding, 1);
  const zoom = Math.log2(Math.min(availW / (w * TILE_SIZE), availH / (h * TILE_SIZE)));
  return {
    center: unmercator((x0 + x1) / 2, (y0 + y1) / 2),
    zoom: Math.min(zoom, maxZoom),
  };
}

/**
 * Zoom at which the ground moves across the screen height in `crossSeconds` when travelling at
 * `metersPerSecond` (of video time). Keeps on-screen speed similar for a short hike and a long ride.
 */
export function zoomForGroundSpeed(
  metersPerSecond: number,
  lat: number,
  viewportHeight: number,
  crossSeconds = 8,
): number {
  const mpp = (metersPerSecond * crossSeconds) / viewportHeight;
  const zoom = Math.log2(
    (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * mpp),
  );
  return Math.min(16.5, Math.max(10, zoom));
}

/** Interpolates two cameras: centre in Mercator space, bearing the short way round. */
export function interpolateCamera(a: CameraState, b: CameraState, t: number): CameraState {
  const [ax, ay] = mercator(...a.center);
  const [bx, by] = mercator(...b.center);
  return {
    center: unmercator(ax + (bx - ax) * t, ay + (by - ay) * t),
    zoom: a.zoom + (b.zoom - a.zoom) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    bearing: a.bearing + shortestDelta(a.bearing, b.bearing) * t,
    offsetY: a.offsetY + (b.offsetY - a.offsetY) * t,
  };
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
