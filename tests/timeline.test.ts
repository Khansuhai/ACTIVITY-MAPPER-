import { describe, expect, it } from 'vitest';
import {
  createTimeline,
  defaultMainDuration,
  INTRO_HOLD,
  travelProfile,
} from '../src/timeline/timeline';
import { straight, switchbacks } from './routes';

const VIEWPORT = { width: 1280, height: 720 };

describe('travelProfile', () => {
  it('starts at 0, ends at 1 and is monotonic', () => {
    expect(travelProfile(0)).toBe(0);
    expect(travelProfile(1)).toBeCloseTo(1, 12);
    let prev = 0;
    for (let i = 1; i <= 1000; i++) {
      const s = travelProfile(i / 1000);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('has continuous speed: no jump when the ramp ends', () => {
    const h = 1e-6;
    const speed = (u: number) => (travelProfile(u + h) - travelProfile(u - h)) / (2 * h);
    expect(speed(0.08 - 1e-4)).toBeCloseTo(speed(0.08 + 1e-4), 2);
    expect(speed(0.5)).toBeCloseTo(1 / 0.92, 6);
    expect(speed(0.001)).toBeLessThan(0.02);
  });

  it('clamps out-of-range input', () => {
    expect(travelProfile(-1)).toBe(0);
    expect(travelProfile(2)).toBe(1);
  });
});

describe('createTimeline', () => {
  const points = straight(90, 10_000);
  const timeline = createTimeline(points, { viewport: VIEWPORT });

  it('adds intro and outro around a main phase scaled to distance', () => {
    expect(defaultMainDuration(10_000)).toBeCloseTo(40, 6);
    expect(defaultMainDuration(0)).toBe(20);
    expect(defaultMainDuration(1_000_000)).toBe(120);
    expect(timeline.mainDuration).toBeCloseTo(40, 0);
    expect(timeline.duration).toBeCloseTo(timeline.introDuration + timeline.mainDuration + 4, 9);
  });

  it('holds a top-down overview at the start, then reaches the chase camera', () => {
    const first = timeline.at(0);
    expect(first.phase).toBe('intro');
    expect(first.camera).toMatchObject({ pitch: 0, bearing: 0, offsetY: 0 });
    expect(timeline.at(INTRO_HOLD * 0.9).camera).toEqual(first.camera);
    const mainStart = timeline.at(timeline.introDuration);
    expect(mainStart.phase).toBe('main');
    expect(mainStart.camera.pitch).toBe(60);
    expect(mainStart.camera.bearing).toBeCloseTo(90, 3);
    // The intro ends exactly where the main phase starts: no jump.
    const justBefore = timeline.at(timeline.introDuration - 1e-9);
    expect(justBefore.camera.zoom).toBeCloseTo(mainStart.camera.zoom, 6);
    expect(justBefore.camera.pitch).toBeCloseTo(mainStart.camera.pitch, 6);
  });

  it('travels the whole route during the main phase', () => {
    expect(timeline.at(timeline.introDuration).distance).toBe(0);
    const mid = timeline.at(timeline.introDuration + timeline.mainDuration / 2);
    expect(mid.progress).toBeCloseTo(0.5, 6);
    const end = timeline.at(timeline.introDuration + timeline.mainDuration);
    expect(end.progress).toBeCloseTo(1, 9);
  });

  it('pulls back in the outro and stays put at the end', () => {
    const end = timeline.at(timeline.duration);
    expect(end.phase).toBe('outro');
    expect(end.progress).toBe(1);
    expect(end.camera.pitch).toBe(40);
    expect(end.camera.zoom).toBeLessThan(timeline.at(timeline.introDuration).camera.zoom);
    expect(timeline.at(timeline.duration - 0.5).camera).toEqual(end.camera);
  });

  it('is deterministic and clamps time', () => {
    const again = createTimeline(points, { viewport: VIEWPORT });
    expect(again.at(17.3)).toEqual(timeline.at(17.3));
    expect(timeline.at(-5)).toEqual(timeline.at(0));
    expect(timeline.at(1e6)).toEqual(timeline.at(timeline.duration));
  });

  it('respects a custom main duration and pitch', () => {
    const t = createTimeline(switchbacks(), { viewport: VIEWPORT, mainDuration: 15, pitch: 50 });
    expect(t.duration).toBe(23);
    expect(t.at(10).camera.pitch).toBe(50);
  });

  it('handles a track where nothing moves', () => {
    const still = [
      { lat: 46, lon: 7, ele: 500, time: 0 },
      { lat: 46, lon: 7, ele: 500, time: 1000 },
    ];
    const t = createTimeline(still, { viewport: VIEWPORT });
    for (const time of [0, 3, 10, t.duration]) {
      const f = t.at(time);
      expect(Number.isFinite(f.camera.zoom)).toBe(true);
      expect(f.camera.center[0]).toBeCloseTo(7, 9);
      expect(f.camera.center[1]).toBeCloseTo(46, 9);
    }
  });
});
