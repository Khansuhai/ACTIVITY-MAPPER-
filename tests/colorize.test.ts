import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '../src/import';
import { VALUE_RAMP } from '../src/render/theme';
import {
  availableColorings,
  buildColoring,
  mercatorProgress,
  pointValues,
  rampColor,
} from '../src/track/colorize';
import { M_PER_DEG } from './helpers';

/** 2 km north: first km at 2 m/s, second at 6 m/s; heart rate and elevation rising. */
const points: TrackPoint[] = [];
let t = 0;
for (let m = 0; m <= 2000; m += 10) {
  points.push({ lat: 46 + m / M_PER_DEG, lon: 7, ele: 1000 + m / 10, time: t, hr: 100 + m / 40 });
  t += m < 1000 ? 5000 : 10000 / 6;
}

describe('rampColor', () => {
  it('runs from the first to the last ramp colour', () => {
    expect(rampColor(0)).toBe(VALUE_RAMP[0]);
    expect(rampColor(1)).toBe(VALUE_RAMP[VALUE_RAMP.length - 1]);
    expect(rampColor(-3)).toBe(VALUE_RAMP[0]);
    expect(rampColor(0.5)).toBe(VALUE_RAMP[2]);
  });
});

describe('availableColorings', () => {
  it('offers only what the data supports', () => {
    expect(availableColorings(points)).toEqual(['solid', 'speed', 'heartrate', 'elevation']);
    const bare = points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null, time: null }));
    expect(availableColorings(bare)).toEqual(['solid']);
  });
});

describe('buildColoring', () => {
  it('is a single colour when solid', () => {
    const c = buildColoring(points, 'solid', '#123456');
    expect(c.colorAt(500)).toBe('#123456');
    expect(c.legend).toBeNull();
  });

  it('colours slow parts low and fast parts high on the ramp', () => {
    const c = buildColoring(points, 'speed', '#000000');
    expect(c.colorAt(300)).toBe(VALUE_RAMP[0]);
    expect(c.colorAt(1700)).toBe(VALUE_RAMP[VALUE_RAMP.length - 1]);
    expect(c.legend).toEqual({ label: 'Speed', min: '7.2 km/h', max: '21.6 km/h' });
  });

  it('colours by heart rate and elevation', () => {
    expect(buildColoring(points, 'heartrate', '#000').legend?.label).toBe('Heart rate');
    const ele = buildColoring(points, 'elevation', '#000');
    expect(ele.colorAt(0)).toBe(VALUE_RAMP[0]);
    expect(ele.colorAt(2000)).toBe(VALUE_RAMP[VALUE_RAMP.length - 1]);
  });

  it('gives strictly increasing gradient stops from 0 to 1', () => {
    const stops = buildColoring(points, 'speed', '#000').gradientStops;
    expect(stops[0]![0]).toBe(0);
    expect(stops.at(-1)![0]).toBeCloseTo(1, 9);
    for (let i = 1; i < stops.length; i++) expect(stops[i]![0]).toBeGreaterThan(stops[i - 1]![0]);
    expect(stops.length).toBeLessThanOrEqual(258);
  });

  it('falls back to solid without data', () => {
    const bare = points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null, time: null }));
    expect(buildColoring(bare, 'heartrate', '#abcdef').colorAt(10)).toBe('#abcdef');
  });
});

describe('pointValues', () => {
  it('smooths heart rate spikes with a rolling median', () => {
    const spiky = points.map((p, i) => ({ ...p, hr: i === 50 ? 250 : 120 }));
    expect(pointValues(spiky, 'heartrate')[50]).toBe(120);
  });
});

describe('mercatorProgress', () => {
  it('runs from 0 to 1', () => {
    const p = mercatorProgress(points);
    expect(p[0]).toBe(0);
    expect(p.at(-1)).toBeCloseTo(1, 12);
  });
});

describe('findHighlights', async () => {
  const { findHighlights } = await import('../src/track/highlights');

  it('finds the highest point and the fastest km', () => {
    const h = findHighlights(points);
    const highest = h.find((x) => x.kind === 'highest')!;
    expect(highest.value).toBeCloseTo(1200, -1);
    expect(highest.distance).toBeGreaterThan(1900);
    const fastest = h.find((x) => x.kind === 'fastest-km')!;
    // The second km is run at 6 m/s: 1000 m in ~167 s.
    expect(fastest.value).toBeCloseTo(1000 / 6, 0);
    expect(fastest.distance).toBeGreaterThan(1000);
  });

  it('skips what the data cannot support', () => {
    const bare = points.map((p) => ({ lat: p.lat, lon: p.lon, ele: null, time: null }));
    expect(findHighlights(bare)).toEqual([]);
    expect(findHighlights(points.slice(0, 50)).map((h) => h.kind)).toEqual(['highest']);
  });
});
