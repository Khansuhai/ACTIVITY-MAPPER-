import type { TrackPoint } from '../import/types';
import { haversine } from '../track/geo';

/** A photo with GPS further than this from the route is not snapped to it. */
export const MAX_OFF_ROUTE_M = 1000;
/** Photos taken this long before the start or after the end still count (warm-up, cool-down). */
export const TIME_SLACK_MS = 10 * 60_000;
/** Route passes within this many metres of the nearest one are "also near" (out-and-back). */
const PASS_TOLERANCE_M = 60;

export type Placement =
  | { method: 'gps'; distance: number; offRouteM: number }
  | { method: 'time'; distance: number }
  | { method: 'none'; reason: 'no-metadata' | 'off-route' | 'outside-activity' | 'privacy' };

export interface PhotoInput {
  gps: { lat: number; lon: number } | null;
  /** Instant taken (epoch ms), after time zone and clock correction, or null. */
  time: number | null;
}

/** Precomputed route data for placing photos. Pure: no DOM, unit tested. */
export class TrackIndex {
  readonly points: readonly TrackPoint[];
  /** Cumulative distance at each point. */
  readonly dist: Float64Array;
  readonly hasTime: boolean;
  readonly startTime: number | null;
  readonly endTime: number | null;

  constructor(points: readonly TrackPoint[]) {
    this.points = points;
    this.dist = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
      this.dist[i] = this.dist[i - 1]! + haversine(points[i - 1]!, points[i]!);
    }
    const times = points.map((p) => p.time).filter((t): t is number => t !== null);
    this.hasTime = times.length >= 2;
    this.startTime = this.hasTime ? times[0]! : null;
    this.endTime = this.hasTime ? times[times.length - 1]! : null;
  }

  /** Distance along the route at a given instant, or null outside the recording. */
  distanceAtTime(time: number): number | null {
    if (
      !this.hasTime ||
      time < this.startTime! - TIME_SLACK_MS ||
      time > this.endTime! + TIME_SLACK_MS
    ) {
      return null;
    }
    const { points, dist } = this;
    let prev = -1;
    for (let i = 0; i < points.length; i++) {
      const t = points[i]!.time;
      if (t === null) continue;
      if (t >= time) {
        if (prev < 0) return dist[i]!;
        const t0 = points[prev]!.time!;
        const f = t > t0 ? (time - t0) / (t - t0) : 0;
        return dist[prev]! + (dist[i]! - dist[prev]!) * f;
      }
      prev = i;
    }
    return dist[prev]!;
  }

  /** Recorded time at a distance along the route (interpolated), or null. */
  timeAtDistance(distance: number): number | null {
    const { points, dist } = this;
    for (let i = 1; i < points.length; i++) {
      if (dist[i]! >= distance) {
        const a = points[i - 1]!.time;
        const b = points[i]!.time;
        if (a === null || b === null) return a ?? b;
        const span = dist[i]! - dist[i - 1]!;
        return a + (b - a) * (span > 0 ? (distance - dist[i - 1]!) / span : 0);
      }
    }
    return points[points.length - 1]!.time;
  }

  /**
   * Every separate pass of the route near a location: for each run of consecutive segments
   * within PASS_TOLERANCE_M of the closest approach, the nearest point of that run.
   */
  passesNear(lat: number, lon: number): { distance: number; offRouteM: number }[] {
    const { points, dist } = this;
    const kx = Math.cos((lat * Math.PI) / 180) * 111_195;
    const ky = 111_195;
    const near: { distance: number; offRouteM: number; segment: number }[] = [];
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
      // Project the photo onto segment i-1 -> i in a local flat frame (metres).
      const a = points[i - 1]!;
      const b = points[i]!;
      const ax = (a.lon - lon) * kx;
      const ay = (a.lat - lat) * ky;
      const bx = (b.lon - lon) * kx;
      const by = (b.lat - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const f = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + dx * f, ay + dy * f);
      best = Math.min(best, d);
      near.push({
        distance: dist[i - 1]! + (dist[i]! - dist[i - 1]!) * f,
        offRouteM: d,
        segment: i,
      });
    }
    const limit = best + PASS_TOLERANCE_M;
    const passes: { distance: number; offRouteM: number }[] = [];
    let current: { distance: number; offRouteM: number } | null = null;
    let lastSegment = -2;
    for (const n of near) {
      if (n.offRouteM > limit) continue;
      if (current && n.segment === lastSegment + 1) {
        if (n.offRouteM < current.offRouteM)
          current = { distance: n.distance, offRouteM: n.offRouteM };
      } else {
        if (current) passes.push(current);
        current = { distance: n.distance, offRouteM: n.offRouteM };
      }
      lastSegment = n.segment;
    }
    if (current) passes.push(current);
    return passes;
  }
}

/**
 * Where on the route a photo belongs:
 * - GPS: the nearest pass of the route. If the route passes nearby more than once (out-and-back,
 *   loops), the photo's time picks the pass; without a time, the nearest one wins.
 * - No GPS: the position at the photo's time.
 */
export function placePhoto(index: TrackIndex, photo: PhotoInput): Placement {
  if (photo.gps) {
    const passes = index.passesNear(photo.gps.lat, photo.gps.lon);
    const nearest = passes.reduce((a, b) => (b.offRouteM < a.offRouteM ? b : a), passes[0]!);
    if (nearest && nearest.offRouteM <= MAX_OFF_ROUTE_M) {
      let chosen = nearest;
      if (passes.length > 1 && photo.time !== null && index.hasTime) {
        const timeError = (p: { distance: number }) =>
          Math.abs((index.timeAtDistance(p.distance) ?? Infinity) - photo.time!);
        chosen = passes.reduce((a, b) => (timeError(b) < timeError(a) ? b : a));
      }
      return { method: 'gps', distance: chosen.distance, offRouteM: chosen.offRouteM };
    }
    // Far from the route (a photo from the car, a wrong GPS fix): fall back to time if possible.
    if (photo.time === null) return { method: 'none', reason: 'off-route' };
  }
  if (photo.time === null) return { method: 'none', reason: 'no-metadata' };
  const distance = index.distanceAtTime(photo.time);
  return distance === null
    ? { method: 'none', reason: 'outside-activity' }
    : { method: 'time', distance };
}

/**
 * Suggests a camera-clock correction from photos that have both GPS and a time: for each, the
 * recorded time at its GPS position minus its timestamp. Returns the median, rounded to the
 * minute, or null with fewer than one usable photo. Photos on a route that passes the same spot
 * twice are skipped, since the right pass is unknown when the clock is off.
 */
export function estimateClockCorrection(index: TrackIndex, photos: PhotoInput[]): number | null {
  if (!index.hasTime) return null;
  const deltas: number[] = [];
  for (const photo of photos) {
    if (!photo.gps || photo.time === null) continue;
    const passes = index.passesNear(photo.gps.lat, photo.gps.lon);
    if (passes.length !== 1 || passes[0]!.offRouteM > 100) continue;
    const trackTime = index.timeAtDistance(passes[0]!.distance);
    if (trackTime !== null) deltas.push(trackTime - photo.time);
  }
  if (deltas.length === 0) return null;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  const median = deltas.length % 2 ? deltas[mid]! : (deltas[mid - 1]! + deltas[mid]!) / 2;
  return Math.round(median / 60_000) * 60_000;
}
