import { describe, expect, it } from 'vitest';
import { type Fix, Recorder } from '../src/record/recorder';
import { M_PER_DEG } from './helpers';

const T0 = Date.UTC(2026, 9, 16, 7);

/** A fix `metres` north of the start, `seconds` after T0. */
const fix = (metres: number, seconds: number, extra: Partial<Fix> = {}): Fix => ({
  lat: 46 + metres / M_PER_DEG,
  lon: 7,
  ele: 500 + metres / 10,
  time: T0 + seconds * 1000,
  accuracy: 5,
  ...extra,
});

/** Runs north at `speed` m/s for `seconds`, one fix per second, from `startM`/`startS`. */
function run(r: Recorder, startM: number, startS: number, seconds: number, speed: number) {
  for (let s = 0; s <= seconds; s++) r.addFix(fix(startM + s * speed, startS + s));
}

describe('Recorder', () => {
  it('records distance and moving time while running', () => {
    const r = new Recorder();
    r.start(T0);
    run(r, 0, 0, 100, 3);
    const s = r.stats(T0 + 100_000);
    expect(s.state).toBe('recording');
    expect(s.distance).toBeCloseTo(300, 6);
    expect(s.movingTime).toBeCloseTo(100, 6);
    expect(s.avgSpeed).toBeCloseTo(3, 6);
    expect(s.currentSpeed).toBeCloseTo(3, 6);
    expect(s.elevationGain).toBeGreaterThan(22); // 30 m climb, minus smoothing at both ends
    expect(s.elevationGain).toBeLessThanOrEqual(30);
  });

  it('ignores fixes before start and after finish', () => {
    const r = new Recorder();
    expect(r.addFix(fix(0, 0))).toBe(false);
    r.start(T0);
    run(r, 0, 0, 10, 3);
    r.finish(T0 + 10_000);
    expect(r.addFix(fix(100, 20))).toBe(false);
    expect(r.state).toBe('finished');
    expect(r.points).toHaveLength(11);
  });

  it('rejects inaccurate fixes and GPS jumps', () => {
    const r = new Recorder();
    r.start(T0);
    run(r, 0, 0, 10, 3);
    expect(r.addFix(fix(33, 11, { accuracy: 80 }))).toBe(false);
    expect(r.addFix(fix(5000, 12))).toBe(false); // 5 km in a second
    expect(r.addFix(fix(36, 12))).toBe(true);
    expect(r.stats(T0 + 12_000).distance).toBeCloseTo(36, 6);
  });

  it('does not count distance or time while paused (e.g. a car ride)', () => {
    const r = new Recorder();
    r.start(T0);
    run(r, 0, 0, 60, 3); // 180 m in 60 s
    r.pause(T0 + 60_000);
    run(r, 180, 60, 120, 15); // 1.8 km by car, ignored
    r.resume(T0 + 180_000);
    run(r, 1980, 180, 60, 3); // another 180 m
    const s = r.stats(T0 + 240_000);
    expect(s.distance).toBeCloseTo(360, 6);
    expect(s.movingTime).toBeCloseTo(120, 6);
    expect(r.segmentStarts).toEqual([0, 61]);
  });

  it('auto-pauses when you stop and resumes when you move on', () => {
    const r = new Recorder({ autoPauseAfter: 30_000, pauseRadius: 20 });
    r.start(T0);
    run(r, 0, 0, 60, 3); // to 180 m at 60 s
    // Standing still (GPS drifts a metre or two) for 2 minutes.
    for (let s = 61; s <= 180; s++) r.addFix(fix(180 + (s % 3), s));
    expect(r.state).toBe('auto-paused');
    // Moving again.
    run(r, 230, 181, 60, 3);
    expect(r.state).toBe('recording');
    const s = r.stats(T0 + 241_000);
    // ~60 s before the stop + ~60 s after; the 2-minute stop is not moving time.
    expect(s.movingTime).toBeGreaterThan(115);
    expect(s.movingTime).toBeLessThan(130);
    expect(s.distance).toBeLessThan(400);
  });

  it('pins photos to the latest position', () => {
    const r = new Recorder();
    expect(r.addPhoto('early', T0)).toBeNull();
    r.start(T0);
    run(r, 0, 0, 10, 3);
    const p = r.addPhoto('summit', T0 + 10_500)!;
    expect(p.lat).toBeCloseTo(46 + 30 / M_PER_DEG, 9);
    expect(r.photos).toHaveLength(1);
  });

  it('thins out fixes while standing still but keeps the time axis', () => {
    const r = new Recorder({ autoPauseAfter: 0 });
    r.start(T0);
    for (let s = 0; s <= 60; s++) r.addFix(fix(0.5 * (s % 2), s)); // 1 minute in place
    expect(r.points.length).toBeLessThanOrEqual(8); // one every ~10 s
  });
});
