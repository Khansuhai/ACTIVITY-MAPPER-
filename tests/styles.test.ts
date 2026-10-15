import { describe, expect, it } from 'vitest';
import type { CameraState } from '../src/camera/camera';
import { HIGHLIGHT_SWING_DEG, styleCamera, SWEEP_DEG } from '../src/camera/styles';
import { planDurations } from '../src/export/plan';
import { createTimeline } from '../src/timeline/timeline';
import { switchbacks } from './routes';

const base: CameraState = { center: [8, 46.6], zoom: 15, pitch: 60, bearing: 90, offsetY: 0.2 };
const ctx = { length: 10_000, highlights: [5000] };

describe('styleCamera', () => {
  it('leaves the chase camera as it is', () => {
    expect(styleCamera('chase', base, 1234, ctx)).toEqual(base);
  });

  it('flies the drone higher and further back, never steeper than the safe pitch', () => {
    const drone = styleCamera('drone', base, 1234, ctx);
    expect(drone.zoom).toBeCloseTo(13.8, 9);
    expect(drone.pitch).toBe(45);
    expect(styleCamera('drone', { ...base, pitch: 35 }, 1234, ctx).pitch).toBe(35);
  });

  it('sweeps the cinematic camera side to side and swings around highlights', () => {
    const start = styleCamera('cinematic', base, 0, { ...ctx, highlights: [] });
    expect(start.bearing).toBeCloseTo(90, 9);
    const atHighlight = styleCamera('cinematic', base, 5000, ctx);
    const away = styleCamera('cinematic', base, 5000, { ...ctx, highlights: [] });
    expect(atHighlight.bearing - away.bearing).toBeCloseTo(HIGHLIGHT_SWING_DEG, 6);
    for (let d = 0; d <= 10_000; d += 50) {
      const c = styleCamera('cinematic', base, d, ctx);
      expect(Math.abs(c.bearing - 90)).toBeLessThanOrEqual(SWEEP_DEG + HIGHLIGHT_SWING_DEG);
      expect(c.pitch).toBeLessThanOrEqual(60);
    }
  });
});

describe('cinematic camera in the timeline', () => {
  it('keeps turning smoothly at 60 fps on a twisty route', () => {
    const timeline = createTimeline(switchbacks(), {
      viewport: { width: 1280, height: 720 },
      cameraStyle: 'cinematic',
      highlights: [3000],
    });
    let maxStep = 0;
    let prev = timeline.at(0).camera.bearing;
    for (let i = 1; i <= Math.round(timeline.duration * 60); i++) {
      const b = timeline.at(i / 60).camera.bearing;
      maxStep = Math.max(maxStep, Math.abs(b - prev));
      prev = b;
    }
    expect(maxStep).toBeLessThan(1.5);
  });
});

describe('planDurations with a chosen photo time', () => {
  it('uses exactly that time per photo', () => {
    const plan = planDurations(60, 5, 4, 5, 6);
    expect(plan.photoDuration).toBe(6);
    expect(plan.travelDuration).toBeCloseTo(60 - 4 - 5 - 30, 9);
  });
});
