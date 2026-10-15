import { mercator, type TrackSampler, unmercator } from '../track/sampler';

/**
 * Smooth camera inputs along the track, as pure functions of distance travelled.
 *
 * Why not low-pass the camera frame by frame? Because that depends on frame rate and on playback
 * history: scrubbing, 30 vs 60 fps, or a slow export would all give different cameras. Smoothing
 * over *distance* makes the camera at a given point identical everywhere (see DECISIONS.md, D13).
 */
export interface SmoothOptions {
  /** Gaussian sigma in metres for the heading. Larger = calmer camera that cuts corners more. */
  headingSigma: number;
  /** Gaussian sigma in metres for the camera centre (GPS noise would otherwise shake the view). */
  centerSigma: number;
  /** Spacing of samples in metres. */
  step: number;
}

/** Defaults scaled to route length: heading ~250 m for a 10 km hike, capped for long rides. */
export function defaultSmoothOptions(length: number): SmoothOptions {
  const headingSigma = clamp(length / 40, 150, 1500);
  return {
    headingSigma,
    centerSigma: headingSigma / 5,
    step: Math.max(5, length / 4000),
  };
}

export interface SmoothCamera {
  /** Heading in degrees. Unwrapped: may leave [0, 360) so it stays continuous. */
  heading(distance: number): number;
  /** Smoothed point to centre the camera on. */
  center(distance: number): [lon: number, lat: number];
}

export function createSmoothCamera(
  sampler: TrackSampler,
  { headingSigma, centerSigma, step }: SmoothOptions = defaultSmoothOptions(sampler.length),
): SmoothCamera {
  const { length } = sampler;
  if (length === 0) {
    const p = sampler.at(0);
    return { heading: () => 0, center: () => [p.lon, p.lat] };
  }

  const count = Math.max(2, Math.ceil(length / step) + 1);
  const spacing = length / (count - 1);

  // Heading: a chord around each sample (ignores wiggles shorter than the chord), unwrapped so
  // 359° -> 1° is a +2° step, then Gaussian-smoothed.
  const halfChord = Math.max(spacing, headingSigma / 4);
  const rawHeading = new Float64Array(count);
  let previous = 0;
  for (let k = 0; k < count; k++) {
    const d = k * spacing;
    const h = localBearing(
      sampler.at(Math.max(0, d - halfChord)),
      sampler.at(Math.min(length, d + halfChord)),
    );
    // Standing still has no direction: keep the last heading.
    rawHeading[k] = h === null ? previous : k === 0 ? h : previous + shortestDelta(previous, h);
    previous = rawHeading[k]!;
  }
  const heading = gaussianSmooth(rawHeading, headingSigma / spacing);

  // Centre: smooth the Mercator coordinates of the path.
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    const p = sampler.at(k * spacing);
    [xs[k], ys[k]] = mercator(p.lon, p.lat);
  }
  const sx = gaussianSmooth(xs, centerSigma / spacing);
  const sy = gaussianSmooth(ys, centerSigma / spacing);

  function interpolate(values: Float64Array, distance: number): number {
    const x = clamp(distance, 0, length) / spacing;
    const k = Math.min(Math.floor(x), count - 2);
    const f = x - k;
    return values[k]! + (values[k + 1]! - values[k]!) * f;
  }

  return {
    heading: (d) => interpolate(heading, d),
    center: (d) => unmercator(interpolate(sx, d), interpolate(sy, d)),
  };
}

/** Gaussian smoothing with sigma in samples; the kernel is renormalized near the ends. */
export function gaussianSmooth(values: Float64Array, sigmaSamples: number): Float64Array {
  const n = values.length;
  if (sigmaSamples < 0.5) return Float64Array.from(values);
  const radius = Math.ceil(3 * sigmaSamples);
  const kernel = Array.from({ length: radius + 1 }, (_, i) =>
    Math.exp(-(i * i) / (2 * sigmaSamples * sigmaSamples)),
  );
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    let weight = 0;
    for (let j = Math.max(0, k - radius); j <= Math.min(n - 1, k + radius); j++) {
      const w = kernel[Math.abs(j - k)]!;
      sum += values[j]! * w;
      weight += w;
    }
    out[k] = sum / weight;
  }
  return out;
}

/** Bearing in degrees (0 = north, 90 = east) for short distances; null if the points coincide. */
export function localBearing(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number | null {
  const dx = (b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return null;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Signed smallest rotation from `from` to `to`, in (-180, 180]. */
export function shortestDelta(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
