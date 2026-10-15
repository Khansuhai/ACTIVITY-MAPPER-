import type { TrackPoint } from '../import/types';
import { haversine } from './geo';
import { smoothElevation } from './stats';

export interface Highlight {
  kind: 'highest' | 'fastest-km';
  /** Metres from the start of the (unhidden) route. */
  distance: number;
  lat: number;
  lon: number;
  /** Highest point: metres. Fastest km: seconds for that km. */
  value: number;
}

/**
 * The highest point (on smoothed elevation, so a single GPS altitude spike can't win) and the
 * fastest kilometre (shortest elapsed time over any 1 km stretch). Either is omitted when the
 * track lacks the data.
 */
export function findHighlights(points: readonly TrackPoint[]): Highlight[] {
  const out: Highlight[] = [];
  const dist = [0];
  for (let i = 1; i < points.length; i++)
    dist.push(dist[i - 1]! + haversine(points[i - 1]!, points[i]!));

  const ele = smoothElevation(points, 30);
  let top = -1;
  for (let i = 0; i < points.length; i++) {
    if (ele[i] !== null && (top < 0 || ele[i]! > ele[top]!)) top = i;
  }
  if (top >= 0) {
    out.push({ kind: 'highest', distance: dist[top]!, ...pos(points[top]!), value: ele[top]! });
  }

  // Two pointers: for each start i, the first j at least 1 km further on.
  let best: { i: number; j: number; seconds: number } | null = null;
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    while (j < points.length && dist[j]! - dist[i]! < 1000) j++;
    if (j >= points.length) break;
    const ti = points[i]!.time;
    const tj = points[j]!.time;
    if (ti === null || tj === null || tj <= ti) continue;
    // Scale to exactly 1 km (j overshoots by up to one sample).
    const seconds = ((tj - ti) / 1000) * (1000 / (dist[j]! - dist[i]!));
    if (!best || seconds < best.seconds) best = { i, j, seconds };
  }
  if (best) {
    const mid = (dist[best.i]! + dist[best.j]!) / 2;
    let k = best.i;
    while (k < best.j && dist[k]! < mid) k++;
    out.push({ kind: 'fastest-km', distance: mid, ...pos(points[k]!), value: best.seconds });
  }
  return out;
}

function pos(p: TrackPoint) {
  return { lat: p.lat, lon: p.lon };
}
