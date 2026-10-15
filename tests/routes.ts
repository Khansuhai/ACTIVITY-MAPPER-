import type { TrackPoint } from '../src/import';
import { M_PER_DEG } from './helpers';

const LAT0 = 46.6;
const LON0 = 8.0;
const M_PER_DEG_LON = M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180);

/** Deterministic pseudo-random numbers (mulberry32). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a track from local metres (x east, y north), one point per second. */
export function fromMetres(xy: [number, number][]): TrackPoint[] {
  return xy.map(([x, y], i) => ({
    lat: LAT0 + y / M_PER_DEG,
    lon: LON0 + x / M_PER_DEG_LON,
    ele: 1000,
    time: Date.UTC(2026, 6, 1) + i * 1000,
  }));
}

/**
 * A nasty mountain road: 24 hairpin switchbacks (legs of 180 m, joined by tight 25 m-radius
 * U-turns) sampled every 2 m, with ±3 m of GPS noise on every point.
 */
export function switchbacks(noise = 3): TrackPoint[] {
  const random = rng(7);
  const xy: [number, number][] = [];
  const leg = 180;
  const radius = 25;
  let y = 0;
  for (let k = 0; k < 24; k++) {
    const dir = k % 2 === 0 ? 1 : -1;
    for (let s = 0; s <= leg; s += 2) xy.push([dir === 1 ? s : leg - s, y]);
    // Hairpin: half circle climbing by 2 * radius.
    const cx = dir === 1 ? leg : 0;
    for (let a = 0; a <= Math.PI; a += 2 / radius) {
      xy.push([cx + dir * radius * Math.sin(a), y + radius - radius * Math.cos(a)]);
    }
    y += 2 * radius;
  }
  return fromMetres(
    xy.map(([x, y]) => [x + (random() - 0.5) * 2 * noise, y + (random() - 0.5) * 2 * noise]),
  );
}

/** A straight line heading `bearing` degrees for `metres`, one point every 5 m. */
export function straight(bearing: number, metres: number): TrackPoint[] {
  const rad = (bearing * Math.PI) / 180;
  return fromMetres(
    Array.from({ length: Math.floor(metres / 5) + 1 }, (_, i): [number, number] => [
      i * 5 * Math.sin(rad),
      i * 5 * Math.cos(rad),
    ]),
  );
}
