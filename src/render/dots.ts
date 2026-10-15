import { metersPerPixel } from '../camera/camera';
import type { TrackSampler } from '../track/sampler';

/** Hard cap so very long routes stay cheap to draw. */
export const MAX_DOTS = 100_000;

/**
 * The travelled part of the route is drawn as dense dots, lit up one by one with MapLibre
 * feature-state as the marker passes. Unlike updating a line every frame, feature-state does not
 * invalidate the terrain's cached textures (see DECISIONS.md, D14).
 *
 * Dots are spaced about one screen pixel apart at the chase camera's zoom, so they read as a
 * solid line.
 */
export function dotSpacing(length: number, chaseZoom: number, lat: number): number {
  const spacing = Math.min(25, Math.max(0.5, metersPerPixel(chaseZoom, lat)));
  return Math.max(spacing, length / (MAX_DOTS - 1));
}

/** [lon, lat] of each dot: dot i is at distance i * spacing, plus one at the very end. */
export function routeDots(sampler: TrackSampler, spacing: number): [number, number][] {
  const dots: [number, number][] = [];
  // Stop half a step early so rounding can't put a near-duplicate dot right before the end.
  for (let d = 0; d < sampler.length - spacing / 2; d += spacing) {
    const p = sampler.at(d);
    dots.push([p.lon, p.lat]);
  }
  const end = sampler.at(sampler.length);
  dots.push([end.lon, end.lat]);
  return dots;
}

/** Index of the dot at `distance`, the marker's dot. */
export function dotIndex(distance: number, spacing: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor(distance / spacing + 1e-9)));
}
