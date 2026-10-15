import { describe, expect, it } from 'vitest';
import {
  fitBounds,
  interpolateCamera,
  metersPerPixel,
  zoomForGroundSpeed,
  type CameraState,
} from '../src/camera/camera';
import {
  createSmoothCamera,
  gaussianSmooth,
  localBearing,
  shortestDelta,
} from '../src/camera/smooth';
import { createSampler, mercator, unmercator } from '../src/track/sampler';
import { createTimeline } from '../src/timeline/timeline';
import { M_PER_DEG } from './helpers';
import { straight, switchbacks } from './routes';

const VIEWPORT = { width: 1280, height: 720 };

describe('sampler', () => {
  it('interpolates position, elevation and time by distance', () => {
    const points = [
      { lat: 46, lon: 7, ele: 100, time: 0 },
      { lat: 46 + 100 / M_PER_DEG, lon: 7, ele: 200, time: 10_000 },
    ];
    const s = createSampler(points);
    expect(s.length).toBeCloseTo(100, 6);
    const mid = s.at(50);
    expect(mid.lat).toBeCloseTo(46 + 50 / M_PER_DEG, 9);
    expect(mid.ele).toBeCloseTo(150, 6);
    expect(mid.time).toBeCloseTo(5000, 3);
    expect(s.at(-10)).toEqual(s.at(0));
    expect(s.at(1e9)).toEqual(s.at(100));
  });

  it('round-trips Mercator coordinates', () => {
    const [lon, lat] = unmercator(...mercator(8.04, 46.62));
    expect(lon).toBeCloseTo(8.04, 9);
    expect(lat).toBeCloseTo(46.62, 9);
  });
});

describe('bearing helpers', () => {
  it('computes compass bearings', () => {
    expect(localBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(localBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(localBearing({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 6);
    expect(localBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 6);
    expect(localBearing({ lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBeNull();
  });

  it('takes the short way round', () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(shortestDelta(0, 180)).toBe(180);
    expect(shortestDelta(720, 0)).toBe(0);
  });

  it('gaussian smoothing keeps constants and averages spikes away', () => {
    for (const v of gaussianSmooth(new Float64Array([5, 5, 5, 5]), 2)) expect(v).toBeCloseTo(5, 9);
    const spike = new Float64Array(41);
    spike[20] = 100;
    expect(Math.max(...gaussianSmooth(spike, 5))).toBeLessThan(10);
  });
});

describe('smooth camera', () => {
  it('follows the true heading on a straight road', () => {
    const cam = createSmoothCamera(createSampler(straight(135, 3000)));
    for (const d of [0, 500, 1500, 3000]) {
      expect(((cam.heading(d) % 360) + 360) % 360).toBeCloseTo(135, 1); // test route uses a flat-earth approximation
    }
  });

  it('crosses north without spinning the long way', () => {
    // Heading 350° then turning to 10°: the camera should rotate +20°, not -340°.
    const a = straight(350, 1000);
    const last = a.at(-1)!;
    const b = straight(10, 1000).map((p) => ({
      ...p,
      lat: p.lat + (last.lat - 46.6),
      lon: p.lon + (last.lon - 8),
    }));
    const cam = createSmoothCamera(createSampler([...a, ...b.slice(1)]));
    const total = createSampler([...a, ...b.slice(1)]).length;
    const start = cam.heading(0);
    const end = cam.heading(total);
    expect(end - start).toBeCloseTo(20, 0);
  });
});

describe('no camera jitter on a twisty mountain route', () => {
  const points = switchbacks();
  const timeline = createTimeline(points, { viewport: VIEWPORT });
  const FPS = 60;

  function frames() {
    const out = [];
    for (let i = 0; i <= Math.round(timeline.duration * FPS); i++) out.push(timeline.at(i / FPS));
    return out;
  }

  it('the raw GPS heading really is jittery (the test is meaningful)', () => {
    let maxJump = 0;
    for (let i = 2; i < points.length; i++) {
      const a = localBearing(points[i - 2]!, points[i - 1]!);
      const b = localBearing(points[i - 1]!, points[i]!);
      if (a !== null && b !== null) maxJump = Math.max(maxJump, Math.abs(shortestDelta(a, b)));
    }
    expect(maxJump).toBeGreaterThan(60);
  });

  it('bearing changes by less than 1° per frame at 60 fps', () => {
    const all = frames();
    let max = 0;
    for (let i = 1; i < all.length; i++) {
      max = Math.max(max, Math.abs(all[i]!.camera.bearing - all[i - 1]!.camera.bearing));
    }
    expect(max).toBeLessThan(1);
  });

  it('bearing rotation is also smooth (no sudden changes of turning speed)', () => {
    const all = frames();
    let maxAccel = 0;
    for (let i = 2; i < all.length; i++) {
      const v1 = all[i - 1]!.camera.bearing - all[i - 2]!.camera.bearing;
      const v2 = all[i]!.camera.bearing - all[i - 1]!.camera.bearing;
      maxAccel = Math.max(maxAccel, Math.abs(v2 - v1));
    }
    expect(maxAccel).toBeLessThan(0.05);
  });

  it('the camera centre moves smoothly despite ±3 m GPS noise', () => {
    const all = frames().filter((f) => f.phase === 'main');
    const mpp = metersPerPixel(all[0]!.camera.zoom, all[0]!.camera.center[1]);
    let maxAccelPx = 0;
    for (let i = 2; i < all.length; i++) {
      const p = all.slice(i - 2, i + 1).map((f) => mercator(...f.camera.center));
      const ax = p[2]![0] - 2 * p[1]![0] + p[0]![0];
      const ay = p[2]![1] - 2 * p[1]![1] + p[0]![1];
      // Mercator units -> metres at this latitude -> pixels.
      const metres = Math.hypot(ax, ay) * 40_075_016.686 * Math.cos((46.6 * Math.PI) / 180);
      maxAccelPx = Math.max(maxAccelPx, metres / mpp);
    }
    expect(maxAccelPx).toBeLessThan(0.5);
  });
});

describe('camera helpers', () => {
  it('computes metres per pixel for 512 px tiles', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.517, 2);
    expect(metersPerPixel(1, 60)).toBeCloseTo(78271.517 / 4, 2);
  });

  it('fits a bounding box like MapLibre', () => {
    const { center, zoom } = fitBounds([7, 46, 8, 47], VIEWPORT, 0);
    expect(center[0]).toBeCloseTo(7.5, 9);
    // The fitted box spans exactly the viewport height at that zoom.
    const [, y0] = mercator(7, 47);
    const [, y1] = mercator(7, 46);
    expect((y1 - y0) * 512 * 2 ** zoom).toBeCloseTo(720, 6);
  });

  it('zooms out for faster travel, within limits', () => {
    const slow = zoomForGroundSpeed(200, 46, 720);
    const fast = zoomForGroundSpeed(2000, 46, 720);
    expect(slow - fast).toBeCloseTo(Math.log2(10), 6);
    expect(zoomForGroundSpeed(1e-3, 46, 720)).toBe(16.5);
    expect(zoomForGroundSpeed(1e7, 46, 720)).toBe(10);
  });

  it('interpolates bearing the short way and centre in Mercator space', () => {
    const a: CameraState = { center: [0, 0], zoom: 10, pitch: 0, bearing: 350, offsetY: 0 };
    const b: CameraState = { center: [10, 0], zoom: 12, pitch: 60, bearing: 10, offsetY: 0.2 };
    const mid = interpolateCamera(a, b, 0.5);
    expect(mid).toMatchObject({ zoom: 11, pitch: 30, bearing: 360, offsetY: 0.1 });
    expect(mid.center[0]).toBeCloseTo(5, 9);
  });
});
