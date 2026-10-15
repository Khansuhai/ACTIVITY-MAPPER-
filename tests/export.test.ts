import { describe, expect, it } from 'vitest';
import {
  avcCodecString,
  chooseBitrate,
  exportViewport,
  planDurations,
  videoSize,
} from '../src/export/plan';
import { createLiveStats, elevationProfile } from '../src/track/live';
import { M_PER_DEG } from './helpers';

describe('videoSize', () => {
  it('names resolutions by their short side', () => {
    expect(videoSize('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(videoSize('9:16', '1080p')).toEqual({ width: 1080, height: 1920 });
    expect(videoSize('1:1', '720p')).toEqual({ width: 720, height: 720 });
    expect(videoSize('16:9', '4k')).toEqual({ width: 3840, height: 2160 });
    expect(videoSize('9:16', '720p')).toEqual({ width: 720, height: 1280 });
  });
});

describe('exportViewport', () => {
  it('keeps the same CSS layout at every resolution, only the pixel ratio changes', () => {
    expect(exportViewport(1920, 1080)).toEqual({
      css: { width: 1280, height: 720 },
      pixelRatio: 1.5,
    });
    expect(exportViewport(3840, 2160)).toEqual({
      css: { width: 1280, height: 720 },
      pixelRatio: 3,
    });
    expect(exportViewport(1080, 1920)).toEqual({
      css: { width: 720, height: 1280 },
      pixelRatio: 1.5,
    });
  });

  it('produces exactly the output size in device pixels', () => {
    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [1080, 1920],
      [3840, 2160],
      [1080, 1080],
    ] as const) {
      const { css, pixelRatio } = exportViewport(w, h);
      expect(Math.round(css.width * pixelRatio)).toBe(w);
      expect(Math.round(css.height * pixelRatio)).toBe(h);
    }
  });
});

describe('avcCodecString', () => {
  it('picks the H.264 level from size, frame rate and bitrate', () => {
    expect(avcCodecString(1280, 720, 30, 5e6)).toBe('avc1.64001f'); // 3.1
    expect(avcCodecString(1920, 1080, 30, 8e6)).toBe('avc1.640028'); // 4.0
    expect(avcCodecString(1920, 1080, 60, 15e6)).toBe('avc1.64002a'); // 4.2, not 4.0
    expect(avcCodecString(1080, 1920, 60, 15e6)).toBe('avc1.64002a'); // portrait too
    expect(avcCodecString(3840, 2160, 30, 30e6)).toBe('avc1.640033'); // 5.1
    expect(avcCodecString(3840, 2160, 60, 60e6)).toBe('avc1.640034'); // 5.2
  });

  it('moves up a level when the bitrate needs it', () => {
    expect(avcCodecString(1920, 1080, 30, 40e6)).toBe('avc1.640029'); // 4.1
  });
});

describe('chooseBitrate', () => {
  it('scales with pixels per second, within bounds', () => {
    expect(chooseBitrate(1920, 1080, 60)).toBeCloseTo(14.93e6, -5);
    expect(chooseBitrate(3840, 2160, 60)).toBeCloseTo(59.7e6, -5);
    expect(chooseBitrate(720, 720, 30)).toBe(5e6);
  });
});

describe('planDurations', () => {
  it('gives all the time to travel without photos', () => {
    expect(planDurations(60, 0, 4, 4)).toEqual({ travelDuration: 52, photoDuration: 0 });
  });

  it('shares the time between travel and photos', () => {
    const { travelDuration, photoDuration } = planDurations(60, 10, 4, 4);
    expect(photoDuration).toBeCloseTo(2.6, 9);
    expect(travelDuration + 10 * photoDuration).toBeCloseTo(52, 9);
  });

  it('caps and floors the photo time', () => {
    expect(planDurations(180, 2, 4, 4).photoDuration).toBe(4);
    const crowded = planDurations(15, 30, 4, 4);
    expect(crowded.photoDuration).toBe(1.5);
    expect(crowded.travelDuration).toBe(5); // over the target: 30 photos cannot fit in 15 s
  });
});

describe('live stats', () => {
  // 1 km north at 2 m/s, climbing 100 m, one point per second.
  const points = Array.from({ length: 501 }, (_, i) => ({
    lat: 46 + (i * 2) / M_PER_DEG,
    lon: 7,
    ele: 1000 + i * 0.2,
    time: Date.UTC(2026, 6, 1) + i * 1000,
  }));
  const live = createLiveStats(points);

  it('reports elapsed time, speed and elevation at a distance', () => {
    const v = live.at(500);
    expect(v.distance).toBe(500);
    expect(v.elapsed).toBeCloseTo(250, 6);
    expect(v.speed).toBeCloseTo(2, 6);
    expect(v.ele).toBeCloseTo(1050, 0);
  });

  it('clamps to the ends of the route', () => {
    expect(live.at(-50).distance).toBe(0);
    expect(live.at(5000).elapsed).toBeCloseTo(500, 6);
  });

  it('returns nulls without timestamps or elevation', () => {
    const bare = createLiveStats(points.map((p) => ({ ...p, time: null, ele: null })));
    expect(bare.at(300)).toEqual({ distance: 300, elapsed: null, speed: null, ele: null });
    expect(elevationProfile(points.map((p) => ({ ...p, ele: null })))).toBeNull();
  });

  it('builds an evenly spaced elevation profile', () => {
    const profile = elevationProfile(points, 11)!;
    expect(profile.distance[10]).toBeCloseTo(1000, 6);
    expect(profile.min).toBeLessThan(profile.max);
    expect(profile.ele[5]).toBeCloseTo(1050, 0);
  });
});
