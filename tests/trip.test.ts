// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importActivity } from '../src/import';
import { defaultTripName, type Trip, tripToGpx } from '../src/record/trip';
import { computeStats } from '../src/track/stats';
import { M_PER_DEG } from './helpers';

const T0 = Date.UTC(2026, 9, 16, 7);
const points = Array.from({ length: 21 }, (_, i) => ({
  lat: 46 + (i * 10) / M_PER_DEG,
  lon: 7,
  ele: 500 + i,
  time: T0 + i * 4000,
}));
const trip: Trip = {
  id: 't1',
  name: 'Morning run & <coffee>',
  sport: 'running',
  createdAt: T0,
  points,
  segmentStarts: [0, 10],
  photos: [{ id: 'p1', time: T0 + 20_000, lat: points[5]!.lat, lon: 7 }],
  distance: 200,
  movingTime: 80,
};

describe('tripToGpx', () => {
  it('round-trips through our own GPX parser', async () => {
    const gpx = tripToGpx(trip);
    const track = await importActivity(
      new TextEncoder().encode(gpx).buffer as ArrayBuffer,
      'x.gpx',
    );
    expect(track.name).toBe('Morning run & <coffee>');
    expect(track.sport).toBe('running');
    expect(track.points).toHaveLength(21);
    expect(track.points[20]).toMatchObject({ ele: 520, time: T0 + 80_000 });
    expect(computeStats(track.points).distance).toBeCloseTo(200, 0);
  });

  it('writes one segment per recording stretch and photos as waypoints', () => {
    const gpx = tripToGpx(trip);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain('<wpt lat=');
    expect(gpx).toContain('&lt;coffee&gt;');
  });
});

describe('defaultTripName', () => {
  it('names the trip after the time of day and sport', () => {
    const at = (h: number) => new Date(2026, 9, 16, h).getTime();
    expect(defaultTripName('running', at(7))).toBe('Morning run');
    expect(defaultTripName('cycling', at(14))).toBe('Afternoon ride');
    expect(defaultTripName('hiking', at(19))).toBe('Evening hike');
    expect(defaultTripName('yoga', at(23))).toBe('Night activity');
  });
});
