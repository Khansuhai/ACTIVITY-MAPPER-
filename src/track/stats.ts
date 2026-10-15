import type { TrackPoint } from '../import/types';
import { haversine } from './geo';

/**
 * Segments slower than this count as stopped (0.3 m/s ≈ 1.1 km/h). Steep hiking can be as slow as
 * 0.35 m/s horizontally, so a higher threshold would drop real climbing from moving time.
 */
export const MOVING_SPEED_THRESHOLD = 0.3;
/** Gaps longer than this (auto-pause, device off) never count as moving time. */
export const MAX_MOVING_GAP_S = 5 * 60;
/** Elevation must change by at least this much before it counts as gain or loss. */
export const ELEVATION_THRESHOLD_M = 3;
/** Elevation is averaged over ±this many metres along the track before gain/loss are counted. */
export const ELEVATION_SMOOTHING_M = 30;
/** Number of consecutive segments whose median speed is used for max speed. */
export const MAX_SPEED_WINDOW = 5;

export interface TrackStats {
  /** Metres. */
  distance: number;
  /** Seconds from first to last timestamp, or null without times. */
  elapsedTime: number | null;
  /** Seconds spent moving, or null without times. */
  movingTime: number | null;
  /** Metres per second over moving time, or null. */
  avgSpeed: number | null;
  /** Metres per second, robust to single-point GPS spikes, or null. */
  maxSpeed: number | null;
  /** Metres, or null without elevation data. */
  elevationGain: number | null;
  elevationLoss: number | null;
  minElevation: number | null;
  maxElevation: number | null;
  /** Epoch ms of the first timestamp, or null. */
  startTime: number | null;
  pointCount: number;
}

/** Computes summary stats. See docs/DECISIONS.md (D9) for the definitions. */
export function computeStats(points: readonly TrackPoint[]): TrackStats {
  let distance = 0;
  let movingTime = 0;
  let timedSegments = 0;
  const segmentSpeeds: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const d = haversine(a, b);
    distance += d;

    if (a.time === null || b.time === null) continue;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0) continue; // duplicate or out-of-order timestamps
    timedSegments++;
    const speed = d / dt;
    segmentSpeeds.push(speed);
    if (speed >= MOVING_SPEED_THRESHOLD && dt <= MAX_MOVING_GAP_S) movingTime += dt;
  }

  // A loop, not Math.min(...times): spreading 100k+ points would overflow the call stack.
  let startTime: number | null = null;
  let endTime: number | null = null;
  for (const { time } of points) {
    if (time === null) continue;
    if (startTime === null || time < startTime) startTime = time;
    if (endTime === null || time > endTime) endTime = time;
  }
  const hasTime = timedSegments > 0;
  const elapsedTime = hasTime ? (endTime! - startTime!) / 1000 : null;

  return {
    distance,
    elapsedTime,
    movingTime: hasTime ? movingTime : null,
    avgSpeed: hasTime && movingTime > 0 ? distance / movingTime : null,
    maxSpeed: hasTime ? maxRollingMedian(segmentSpeeds, MAX_SPEED_WINDOW) : null,
    ...elevationStats(points),
    startTime,
    pointCount: points.length,
  };
}

/**
 * Max of the rolling median of segment speeds. A single bad GPS point creates two fast segments
 * (out to the spike and back), and a 5-segment median ignores both.
 */
export function maxRollingMedian(values: readonly number[], window: number): number | null {
  if (values.length === 0) return null;
  if (values.length <= window) return median(values);
  let max = -Infinity;
  for (let i = 0; i + window <= values.length; i++) {
    max = Math.max(max, median(values.slice(i, i + window)));
  }
  return max;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Gain and loss in two steps, to filter GPS altitude noise:
 * 1. average elevation over ±ELEVATION_SMOOTHING_M along the track (by distance, not by point
 *    count, so a long stop full of jittery samples collapses into one value), then
 * 2. hysteresis: elevation only counts once it moves ELEVATION_THRESHOLD_M away from the last
 *    reference value.
 * Min and max use the raw values, as recorded.
 */
export function elevationStats(points: readonly TrackPoint[]) {
  let gain = 0;
  let loss = 0;
  let ref: number | null = null;
  let min = Infinity;
  let max = -Infinity;

  for (const { ele } of points) {
    if (ele === null) continue;
    min = Math.min(min, ele);
    max = Math.max(max, ele);
  }

  for (const ele of smoothElevation(points, ELEVATION_SMOOTHING_M)) {
    if (ele === null) continue;
    if (ref === null) {
      ref = ele;
    } else if (ele - ref >= ELEVATION_THRESHOLD_M) {
      gain += ele - ref;
      ref = ele;
    } else if (ref - ele >= ELEVATION_THRESHOLD_M) {
      loss += ref - ele;
      ref = ele;
    }
  }

  const hasEle = ref !== null;
  return {
    elevationGain: hasEle ? gain : null,
    elevationLoss: hasEle ? loss : null,
    minElevation: hasEle ? min : null,
    maxElevation: hasEle ? max : null,
  };
}

/**
 * Mean elevation of all points within ±halfWindow metres of along-track distance. O(n) with a
 * sliding window, since cumulative distance never decreases.
 */
export function smoothElevation(
  points: readonly TrackPoint[],
  halfWindow: number,
): (number | null)[] {
  const dist: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    dist.push(dist[i - 1]! + haversine(points[i - 1]!, points[i]!));
  }

  const out: (number | null)[] = [];
  let lo = 0;
  let hi = 0; // window is [lo, hi)
  let sum = 0;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    const d = dist[i]!;
    while (hi < points.length && dist[hi]! <= d + halfWindow) {
      const e = points[hi]!.ele;
      if (e !== null) {
        sum += e;
        count++;
      }
      hi++;
    }
    while (dist[lo]! < d - halfWindow) {
      const e = points[lo]!.ele;
      if (e !== null) {
        sum -= e;
        count--;
      }
      lo++;
    }
    out.push(points[i]!.ele === null || count === 0 ? null : sum / count);
  }
  return out;
}
