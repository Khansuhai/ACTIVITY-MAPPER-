import type { TrackPoint } from '../import/types';
import { haversine } from './geo';
import { smoothElevation } from './stats';

/** Values shown in the live stats overlay at a point of the flyover. */
export interface LiveValues {
  /** Metres from the start. */
  distance: number;
  /** Seconds since the recording started, or null without timestamps. */
  elapsed: number | null;
  /** Metres per second around this point, or null without timestamps. */
  speed: number | null;
  /** Metres (smoothed), or null without elevation. */
  ele: number | null;
}

export interface ElevationProfile {
  /** Distances (m) and smoothed elevations (m) at evenly spaced samples. */
  distance: Float64Array;
  ele: Float64Array;
  min: number;
  max: number;
  length: number;
}

/** Half-width of the distance window used to measure the current speed. */
const SPEED_WINDOW_M = 75;

/** Live stats as a pure function of distance travelled, for the overlay. */
export function createLiveStats(points: readonly TrackPoint[]) {
  const n = points.length;
  const dist = new Float64Array(n);
  for (let i = 1; i < n; i++) dist[i] = dist[i - 1]! + haversine(points[i - 1]!, points[i]!);
  const ele = smoothElevation(points, 30);
  const start = points.find((p) => p.time !== null)?.time ?? null;

  /** Linear interpolation of per-point values at a distance; nulls are skipped. */
  function valueAt(values: (number | null)[], d: number): number | null {
    let lo = 0;
    let hi = n - 1;
    if (d <= 0) return firstNonNull(values, 0, 1);
    if (d >= dist[n - 1]!) return firstNonNull(values, n - 1, -1);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid]! <= d) lo = mid;
      else hi = mid;
    }
    const a = values[lo] ?? null;
    const b = values[hi] ?? null;
    if (a === null || b === null) return a ?? b;
    const span = dist[hi]! - dist[lo]!;
    return a + (b - a) * (span > 0 ? (d - dist[lo]!) / span : 0);
  }

  function firstNonNull(values: (number | null)[], from: number, step: number): number | null {
    for (let i = from; i >= 0 && i < n; i += step) if (values[i] !== null) return values[i]!;
    return null;
  }

  const times = points.map((p) => p.time);

  return {
    length: dist[n - 1]!,
    at(distance: number): LiveValues {
      const d = Math.min(dist[n - 1]!, Math.max(0, distance));
      const t = valueAt(times, d);
      let speed: number | null = null;
      const d0 = Math.max(0, d - SPEED_WINDOW_M);
      const d1 = Math.min(dist[n - 1]!, d + SPEED_WINDOW_M);
      const t0 = valueAt(times, d0);
      const t1 = valueAt(times, d1);
      if (t0 !== null && t1 !== null && t1 > t0) speed = (d1 - d0) / ((t1 - t0) / 1000);
      return {
        distance: d,
        elapsed: t !== null && start !== null ? (t - start) / 1000 : null,
        speed,
        ele: valueAt(ele, d),
      };
    },
  };
}

export type LiveStats = ReturnType<typeof createLiveStats>;

/** Evenly spaced, smoothed elevation samples for the profile chart, or null without elevation. */
export function elevationProfile(
  points: readonly TrackPoint[],
  samples = 300,
): ElevationProfile | null {
  const live = createLiveStats(points);
  if (live.at(0).ele === null) return null;
  const distance = new Float64Array(samples);
  const ele = new Float64Array(samples);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples; i++) {
    const d = (live.length * i) / (samples - 1);
    const e = live.at(d).ele ?? 0;
    distance[i] = d;
    ele[i] = e;
    min = Math.min(min, e);
    max = Math.max(max, e);
  }
  return { distance, ele, min, max, length: live.length };
}
