import type { TrackPoint } from '../import/types';
import { haversine } from './geo';

export const PRIVACY_RADII = [0, 200, 500, 1000] as const;

export interface PrivacyResult {
  /** The points that may be shown. */
  points: TrackPoint[];
  /** Metres of route hidden at the start (live stats add this, so totals stay true). */
  hiddenStartM: number;
  /** Metres hidden at the end. */
  hiddenEndM: number;
  /** Centres of the hidden zones (the original start and finish). */
  zones: { lat: number; lon: number }[];
}

/**
 * Privacy zone: hides the route within `radius` metres of where it starts and where it ends, so
 * the video does not show where you live. Points are removed from each end up to the first point
 * outside the circle. A route that later passes back through the zone stays visible there
 * (cutting the middle out would break the line).
 *
 * If hiding would leave fewer than 2 points (a short loop around home), nothing is hidden and the
 * caller should warn.
 */
export function applyPrivacyZone(points: readonly TrackPoint[], radius: number): PrivacyResult {
  const all = [...points];
  const none: PrivacyResult = { points: all, hiddenStartM: 0, hiddenEndM: 0, zones: [] };
  if (radius <= 0 || points.length < 2) return none;

  const start = points[0]!;
  const end = points[points.length - 1]!;
  let first = 0;
  while (first < points.length && haversine(start, points[first]!) <= radius) first++;
  let last = points.length - 1;
  while (last >= 0 && haversine(end, points[last]!) <= radius) last--;
  if (last - first < 1) return none;

  let hiddenStartM = 0;
  for (let i = 1; i <= first; i++) hiddenStartM += haversine(points[i - 1]!, points[i]!);
  let hiddenEndM = 0;
  for (let i = last + 1; i < points.length; i++)
    hiddenEndM += haversine(points[i - 1]!, points[i]!);

  return {
    points: points.slice(first, last + 1),
    hiddenStartM,
    hiddenEndM,
    zones: [
      { lat: start.lat, lon: start.lon },
      { lat: end.lat, lon: end.lon },
    ],
  };
}

/** True if a location lies inside one of the zones. */
export function inPrivacyZone(
  zones: readonly { lat: number; lon: number }[],
  radius: number,
  p: { lat: number; lon: number },
): boolean {
  return radius > 0 && zones.some((z) => haversine(z, p) <= radius);
}
