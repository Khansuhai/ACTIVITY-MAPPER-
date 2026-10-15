import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '../src/import';
import { bbox, haversine } from '../src/track/geo';
import { computeStats, elevationStats, maxRollingMedian } from '../src/track/stats';
import { M_PER_DEG } from './helpers';

const T0 = Date.UTC(2026, 5, 1, 8);

/** A straight line north at `speed` m/s, one point per second. */
function line(count: number, speed: number): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 46 + (i * speed) / M_PER_DEG,
    lon: 7,
    ele: null,
    time: T0 + i * 1000,
  }));
}

describe('haversine', () => {
  it('matches known distances', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(M_PER_DEG, 6);
    // London to Paris is about 343.5 km.
    const d = haversine({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
    expect(d / 1000).toBeCloseTo(343.5, 0);
  });

  it('is zero for identical points', () => {
    expect(haversine({ lat: 46, lon: 7 }, { lat: 46, lon: 7 })).toBe(0);
  });
});

describe('bbox', () => {
  it('returns [west, south, east, north]', () => {
    const points = [
      { lat: 46, lon: 7 },
      { lat: 45.5, lon: 8 },
      { lat: 46.2, lon: 6.5 },
    ];
    expect(bbox(points)).toEqual([6.5, 45.5, 8, 46.2]);
  });
});

describe('computeStats', () => {
  it('computes distance, time and speeds for steady movement', () => {
    const stats = computeStats(line(61, 3));
    expect(stats.distance).toBeCloseTo(180, 6);
    expect(stats.elapsedTime).toBe(60);
    expect(stats.movingTime).toBe(60);
    expect(stats.avgSpeed).toBeCloseTo(3, 6);
    expect(stats.maxSpeed).toBeCloseTo(3, 6);
    expect(stats.pointCount).toBe(61);
  });

  it('ignores a single-point GPS spike for max speed', () => {
    const points = line(61, 3);
    points[30] = { ...points[30]!, lat: points[30]!.lat + 200 / M_PER_DEG }; // 200 m jump
    expect(computeStats(points).maxSpeed).toBeCloseTo(3, 1);
  });

  it('excludes stops and long pauses from moving time', () => {
    const moving = line(11, 4); // 10 s moving
    const last = moving.at(-1)!;
    const stopped = [1, 2, 3].map((s) => ({ ...last, time: last.time! + s * 20_000 })); // 60 s stop
    const resumed = line(11, 4).map((p) => ({
      ...p,
      lat: p.lat + (last.lat - 46),
      time: p.time! + 10 * 60_000, // after a 10-minute auto-pause gap
    }));
    const stats = computeStats([...moving, ...stopped, ...resumed]);
    expect(stats.movingTime).toBe(20);
    expect(stats.avgSpeed).toBeCloseTo(4, 3);
  });

  it('skips segments with duplicate or backwards timestamps', () => {
    const points = line(5, 2);
    points[2] = { ...points[2]!, time: points[1]!.time };
    expect(Number.isFinite(computeStats(points).maxSpeed)).toBe(true);
  });

  it('returns null time stats when there are no timestamps', () => {
    const stats = computeStats(line(10, 3).map((p) => ({ ...p, time: null })));
    expect(stats.distance).toBeCloseTo(27, 6);
    expect(stats.elapsedTime).toBeNull();
    expect(stats.movingTime).toBeNull();
    expect(stats.avgSpeed).toBeNull();
    expect(stats.maxSpeed).toBeNull();
    expect(stats.startTime).toBeNull();
  });

  it('handles very long tracks without a stack overflow', () => {
    expect(computeStats(line(200_000, 3)).elapsedTime).toBe(199_999);
  });
});

describe('elevationStats', () => {
  const pts = (eles: (number | null)[]) =>
    eles.map((ele): TrackPoint => ({ lat: 46, lon: 7, ele, time: null }));

  it('filters GPS altitude noise below the threshold', () => {
    const noisy = pts([100, 101, 99, 101, 100, 102, 100, 101]);
    expect(elevationStats(noisy)).toMatchObject({ elevationGain: 0, elevationLoss: 0 });
  });

  it('counts a steady 1 m-per-point climb (all but the last partial step)', () => {
    const climb = pts(Array.from({ length: 101 }, (_, i) => 1000 + i));
    expect(elevationStats(climb)).toMatchObject({ elevationGain: 99, elevationLoss: 0 });
  });

  it('counts a climb and a descent', () => {
    expect(elevationStats(pts([100, 150, 120, 200]))).toEqual({
      elevationGain: 130,
      elevationLoss: 30,
      minElevation: 100,
      maxElevation: 200,
    });
  });

  it('skips missing elevations and returns nulls when there are none', () => {
    expect(elevationStats(pts([null, 100, null, 110]))).toMatchObject({ elevationGain: 10 });
    expect(elevationStats(pts([null, null]))).toEqual({
      elevationGain: null,
      elevationLoss: null,
      minElevation: null,
      maxElevation: null,
    });
  });
});

describe('maxRollingMedian', () => {
  it('returns null for no values and the median for short input', () => {
    expect(maxRollingMedian([], 5)).toBeNull();
    expect(maxRollingMedian([1, 9, 3], 5)).toBe(3);
  });

  it('ignores up to two outliers per window', () => {
    expect(maxRollingMedian([3, 3, 3, 90, 90, 3, 3, 3], 5)).toBe(3);
  });

  it('finds a sustained peak', () => {
    expect(maxRollingMedian([3, 3, 8, 8, 8, 3, 3], 5)).toBe(8);
  });
});
