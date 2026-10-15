import type { TrackPoint } from '../import/types';
import { haversine } from './geo';

export interface SampledPosition {
  lat: number;
  lon: number;
  ele: number | null;
  /** Interpolated timestamp (epoch ms), or null when the track has no times. */
  time: number | null;
}

/**
 * Answers "where am I after `d` metres?" for a track, in O(log n). Pure and DOM-free: the preview,
 * the exporter and tests all use it.
 */
export interface TrackSampler {
  /** Total length in metres (haversine). */
  readonly length: number;
  at(distance: number): SampledPosition;
  /**
   * The fraction of the line's Web Mercator length covered after `distance` metres. MapLibre's
   * `line-progress` is measured in Mercator units, which differ from metres by up to 1/cos(lat),
   * so we convert to keep the bright route line ending exactly at the marker.
   */
  lineProgress(distance: number): number;
}

export function createSampler(points: readonly TrackPoint[]): TrackSampler {
  if (points.length === 0) throw new Error('Cannot sample an empty track');

  const n = points.length;
  const dist = new Float64Array(n);
  const merc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    dist[i] = dist[i - 1]! + haversine(a, b);
    const [ax, ay] = mercator(a.lon, a.lat);
    const [bx, by] = mercator(b.lon, b.lat);
    merc[i] = merc[i - 1]! + Math.hypot(bx - ax, by - ay);
  }
  const length = dist[n - 1]!;
  const mercLength = merc[n - 1]!;

  /** Index i and fraction f such that distance lies between points i and i+1. */
  function locate(distance: number): [number, number] {
    if (!(distance > 0)) return [0, 0];
    if (distance >= length) return [n - 1, 0];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid]! <= distance) lo = mid;
      else hi = mid;
    }
    const span = dist[hi]! - dist[lo]!;
    return [lo, span > 0 ? (distance - dist[lo]!) / span : 0];
  }

  return {
    length,
    at(distance) {
      const [i, f] = locate(distance);
      const a = points[i]!;
      const b = points[Math.min(i + 1, n - 1)]!;
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
        ele: lerpNullable(a.ele, b.ele, f),
        time: lerpNullable(a.time, b.time, f),
      };
    },
    lineProgress(distance) {
      if (mercLength === 0) return 0;
      const [i, f] = locate(distance);
      const m = merc[i]! + (merc[Math.min(i + 1, n - 1)]! - merc[i]!) * f;
      return m / mercLength;
    },
  };
}

function lerpNullable(a: number | null, b: number | null, f: number): number | null {
  if (a === null) return b === null ? null : b;
  if (b === null) return a;
  return a + (b - a) * f;
}

/** Web Mercator in unit square coordinates (0..1), as MapLibre uses internally. */
export function mercator(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;
  return [x, y];
}

export function unmercator(x: number, y: number): [lon: number, lat: number] {
  const lon = x * 360 - 180;
  const lat = (360 / Math.PI) * Math.atan(Math.exp((180 - y * 360) * (Math.PI / 180))) - 90;
  return [lon, lat];
}
