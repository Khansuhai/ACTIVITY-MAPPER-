import { describe, expect, it } from 'vitest';
import { applyPrivacyZone, inPrivacyZone } from '../src/track/privacy';
import { M_PER_DEG } from './helpers';

/** 2 km due north, a point every 10 m. */
const line = Array.from({ length: 201 }, (_, i) => ({
  lat: 46 + (i * 10) / M_PER_DEG,
  lon: 7,
  ele: null,
  time: i * 1000,
}));

describe('applyPrivacyZone', () => {
  it('changes nothing with radius 0', () => {
    const r = applyPrivacyZone(line, 0);
    expect(r.points).toHaveLength(201);
    expect(r.hiddenStartM).toBe(0);
    expect(r.zones).toEqual([]);
  });

  it('hides the route within the radius of the start and the finish', () => {
    const r = applyPrivacyZone(line, 205);
    // Points at 0..200 m and 1800..2000 m are hidden (205 m avoids a point exactly on the edge).
    expect(r.points[0]!.lat).toBeCloseTo(46 + 210 / M_PER_DEG, 9);
    expect(r.points.at(-1)!.lat).toBeCloseTo(46 + 1790 / M_PER_DEG, 9);
    expect(r.hiddenStartM).toBeCloseTo(210, 6);
    expect(r.hiddenEndM).toBeCloseTo(210, 6);
    expect(r.zones).toHaveLength(2);
  });

  it('keeps everything if the whole route is inside the zone', () => {
    const r = applyPrivacyZone(line, 5000);
    expect(r.points).toHaveLength(201);
    expect(r.hiddenStartM).toBe(0);
  });

  it('hides both ends of a loop that starts and ends at home', () => {
    const loop = [...line, ...line.slice(0, -1).reverse()];
    const r = applyPrivacyZone(loop, 300);
    expect(r.points.length).toBeLessThan(loop.length);
    for (const p of [r.points[0]!, r.points.at(-1)!]) {
      expect(inPrivacyZone(r.zones, 300, p)).toBe(false);
    }
  });
});

describe('inPrivacyZone', () => {
  it('checks the distance to each zone centre', () => {
    const zones = [{ lat: 46, lon: 7 }];
    expect(inPrivacyZone(zones, 100, { lat: 46 + 50 / M_PER_DEG, lon: 7 })).toBe(true);
    expect(inPrivacyZone(zones, 100, { lat: 46 + 150 / M_PER_DEG, lon: 7 })).toBe(false);
    expect(inPrivacyZone(zones, 0, { lat: 46, lon: 7 })).toBe(false);
  });
});
