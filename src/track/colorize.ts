import type { TrackPoint } from '../import/types';
import { VALUE_RAMP } from '../render/theme';
import { mercator } from './sampler';
import { haversine } from './geo';
import { smoothElevation } from './stats';

export type ColorBy = 'solid' | 'speed' | 'heartrate' | 'elevation';

export interface RouteColoring {
  /** Colour of the route at a distance along it. */
  colorAt(distance: number): string;
  /** [line-progress (Mercator length fraction), colour] stops for a MapLibre line-gradient. */
  gradientStops: [number, string][];
  legend: { label: string; min: string; max: string } | null;
}

/** Which colourings this track supports (heart rate, speed and elevation need data). */
export function availableColorings(points: readonly TrackPoint[]): ColorBy[] {
  const out: ColorBy[] = ['solid'];
  if (points.filter((p) => p.time !== null).length >= 2) out.push('speed');
  if (points.some((p) => p.hr !== undefined)) out.push('heartrate');
  if (points.some((p) => p.ele !== null)) out.push('elevation');
  return out;
}

/** One value per point for a colouring, smoothed so GPS noise doesn't paint stripes. */
export function pointValues(points: readonly TrackPoint[], by: ColorBy): (number | null)[] {
  if (by === 'elevation') return smoothElevation(points, 30);
  if (by === 'heartrate')
    return rollingMedian(
      points.map((p) => p.hr ?? null),
      5,
    );
  if (by === 'speed') return speeds(points);
  return points.map(() => null);
}

/**
 * Builds the colouring for a route. Values are mapped onto the ramp between their 5th and 95th
 * percentiles, so a single GPS spike cannot wash out the whole route.
 */
export function buildColoring(
  points: readonly TrackPoint[],
  by: ColorBy,
  solidColor: string,
): RouteColoring {
  const dist = cumulative(points);
  const length = dist[dist.length - 1] ?? 0;
  const values = pointValues(points, by);
  const known = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (by === 'solid' || known.length < 2) {
    return { colorAt: () => solidColor, gradientStops: [[0, solidColor]], legend: null };
  }
  const lo = quantile(known, 0.05);
  const hi = Math.max(quantile(known, 0.95), lo + 1e-6);
  const colorOf = (v: number | null) => (v === null ? solidColor : rampColor((v - lo) / (hi - lo)));

  const valueAt = (d: number): number | null => {
    let a = 0;
    let b = points.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (dist[m]! <= d) a = m;
      else b = m;
    }
    const va = values[a] ?? null;
    const vb = values[b] ?? null;
    if (va === null || vb === null) return va ?? vb;
    const span = dist[b]! - dist[a]!;
    return va + (vb - va) * (span > 0 ? (d - dist[a]!) / span : 0);
  };

  // Gradient stops along MapLibre's line-progress (Mercator length), at most ~256 of them.
  const merc = mercatorProgress(points);
  const step = Math.max(1, Math.floor(points.length / 256));
  const gradientStops: [number, string][] = [];
  for (let i = 0; i < points.length; i += step)
    gradientStops.push([merc[i]!, colorOf(values[i] ?? null)]);
  const lastIndex = points.length - 1;
  if (gradientStops.at(-1)![0] < 1) gradientStops.push([1, colorOf(values[lastIndex] ?? null)]);

  const format = FORMATS[by];
  return {
    colorAt: (d) => colorOf(valueAt(Math.min(length, Math.max(0, d)))),
    gradientStops: dedupe(gradientStops),
    legend: { label: format.label, min: format.value(lo), max: format.value(hi) },
  };
}

const FORMATS: Record<Exclude<ColorBy, 'solid'>, { label: string; value(v: number): string }> = {
  speed: { label: 'Speed', value: (v) => `${(v * 3.6).toFixed(1)} km/h` },
  heartrate: { label: 'Heart rate', value: (v) => `${Math.round(v)} bpm` },
  elevation: { label: 'Elevation', value: (v) => `${Math.round(v)} m` },
};

/** Colour on VALUE_RAMP for t in 0..1 (clamped), as #rrggbb. */
export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (VALUE_RAMP.length - 1);
  const i = Math.min(Math.floor(x), VALUE_RAMP.length - 2);
  const f = x - i;
  const a = hex(VALUE_RAMP[i]!);
  const b = hex(VALUE_RAMP[i + 1]!);
  const mix = a.map((c, k) => Math.round(c + (b[k]! - c) * f));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function hex(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

/** Speed at each point over a ±25-point window, so single noisy samples don't dominate. */
function speeds(points: readonly TrackPoint[]): (number | null)[] {
  const dist = cumulative(points);
  return points.map((_, i) => {
    const a = Math.max(0, i - 25);
    const b = Math.min(points.length - 1, i + 25);
    const ta = points[a]!.time;
    const tb = points[b]!.time;
    if (ta === null || tb === null || tb <= ta) return null;
    return (dist[b]! - dist[a]!) / ((tb - ta) / 1000);
  });
}

function rollingMedian(values: (number | null)[], radius: number): (number | null)[] {
  return values.map((_, i) => {
    const w = values
      .slice(Math.max(0, i - radius), i + radius + 1)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    return w.length ? w[w.length >> 1]! : null;
  });
}

function cumulative(points: readonly TrackPoint[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++)
    out.push(out[i - 1]! + haversine(points[i - 1]!, points[i]!));
  return out;
}

/** Fraction of the line's Web Mercator length at each point (what MapLibre's line-progress uses). */
export function mercatorProgress(points: readonly TrackPoint[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = mercator(points[i - 1]!.lon, points[i - 1]!.lat);
    const [bx, by] = mercator(points[i]!.lon, points[i]!.lat);
    out.push(out[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  const total = out[out.length - 1]! || 1;
  return out.map((m) => m / total);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
}

/** line-gradient stops must strictly increase. */
function dedupe(stops: [number, string][]): [number, string][] {
  return stops.filter((s, i) => i === 0 || s[0] > stops[i - 1]![0]);
}
