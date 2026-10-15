import { describe, expect, it } from 'vitest';
import { pitchProfile, type ElevationFn } from '../src/camera/clearance';
import { createTimeline } from '../src/timeline/timeline';
import { M_PER_DEG } from './helpers';
import { straight } from './routes';

const LAT0 = 46.6;
/** A route due north for 10 km (tests/routes.ts starts at 46.6 N, 8 E). */
const points = straight(0, 10_000);
const flat: ElevationFn = () => 1000;
/** An east-west ridge `height` m high, 4 km north of the start. */
const ridgeOf =
  (height: number): ElevationFn =>
  (_lon, lat) => {
    const y = (lat - LAT0) * M_PER_DEG;
    return 1000 + height * Math.exp(-(((y - 4000) / 250) ** 2));
  };
const ridge = ridgeOf(1500);

function profile(elevationAt: ElevationFn, exaggeration = 1) {
  return pitchProfile({
    length: 10_000,
    center: (d) => [8, LAT0 + d / M_PER_DEG],
    heading: () => 0,
    elevationAt,
    exaggeration,
    viewportHeight: 720,
    zoom: 14,
    pitch: 60,
  });
}

describe('pitchProfile', () => {
  it('keeps the normal pitch over flat ground', () => {
    const p = profile(flat);
    for (const d of [0, 2500, 5000, 10_000]) expect(p(d)).toBeCloseTo(60, 9);
  });

  it('tilts down when a ridge behind the marker would hide it', () => {
    const p = profile(ridge);
    expect(p(1000)).toBeCloseTo(60, 6); // ridge ahead of the camera: no problem
    expect(p(4600)).toBeLessThan(50); // just past the ridge, the camera is behind it
    expect(p(9800)).toBeCloseTo(60, 6); // camera past the ridge again
  });

  it('changes pitch smoothly (no jumps)', () => {
    const p = profile(ridge);
    let maxStep = 0;
    for (let d = 10; d <= 10_000; d += 10) maxStep = Math.max(maxStep, Math.abs(p(d) - p(d - 10)));
    expect(maxStep).toBeLessThan(0.6); // degrees per 10 m
  });

  it('reacts to exaggeration (taller terrain needs more tilt)', () => {
    const low = ridgeOf(400);
    expect(profile(low, 2)(4600)).toBeLessThan(profile(low, 1)(4600) - 1);
  });

  it('ignores unknown elevation', () => {
    expect(profile(() => null)(5000)).toBeCloseTo(60, 9);
  });
});

describe('timeline with terrain', () => {
  it('uses the pitch profile in the chase camera', () => {
    const viewport = { width: 1280, height: 720 };
    const plain = createTimeline(points, { viewport });
    const aware = createTimeline(points, {
      viewport,
      terrain: { elevationAt: ridge, exaggeration: 1 },
    });
    const mid = plain.introDuration + plain.mainDuration * 0.47; // ~4.6 km along
    expect(plain.at(mid).camera.pitch).toBe(60);
    expect(aware.at(mid).camera.pitch).toBeLessThan(55);
    expect(aware.at(plain.introDuration + 0.1).camera.pitch).toBeCloseTo(60, 3);
  });
});
