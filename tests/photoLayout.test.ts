import { describe, expect, it } from 'vitest';
import {
  contain,
  cover,
  FADE,
  photoLayout,
  seedFromId,
  type Rect,
} from '../src/render/photoLayout';

const covers = (r: Rect, w: number, h: number) =>
  r.x <= 1e-9 && r.y <= 1e-9 && r.x + r.w >= w - 1e-9 && r.y + r.h >= h - 1e-9;
const inside = (r: Rect, w: number, h: number) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9;

describe('contain and cover', () => {
  it('fit a 4:3 photo into 16:9', () => {
    expect(contain(4000, 3000, 1600, 900)).toEqual({ x: 200, y: 0, w: 1200, h: 900 });
    expect(cover(4000, 3000, 1600, 900)).toEqual({ x: 0, y: -150, w: 1600, h: 1200 });
  });
});

describe('photoLayout', () => {
  it('fades in, holds, then fades out', () => {
    expect(photoLayout(4, 3, 16, 9, 0).opacity).toBe(0);
    expect(photoLayout(4, 3, 16, 9, FADE / 2).opacity).toBeCloseTo(0.5, 9);
    expect(photoLayout(4, 3, 16, 9, 0.5).opacity).toBe(1);
    expect(photoLayout(4, 3, 16, 9, 1).opacity).toBe(0);
  });

  it('fills the frame with a landscape photo in a landscape video, never showing gaps', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      for (const seed of [0.1, 0.9]) {
        const l = photoLayout(4000, 3000, 1920, 1080, u, seed);
        expect(l.backdrop).toBeNull();
        expect(covers(l.photo, 1920, 1080)).toBe(true);
      }
    }
  });

  it('keeps the photo aspect ratio (no stretching)', () => {
    for (const [w, h] of [
      [4000, 3000],
      [3000, 4000],
      [1080, 1920],
    ] as const) {
      const l = photoLayout(w, h, 1920, 1080, 0.6, 0.3);
      expect(l.photo.w / l.photo.h).toBeCloseTo(w / h, 9);
    }
  });

  it('shows a portrait photo whole on a blurred backdrop in a landscape video', () => {
    for (const u of [0, 0.5, 1]) {
      const l = photoLayout(3000, 4000, 1920, 1080, u, 0.7);
      expect(l.backdrop).not.toBeNull();
      expect(covers(l.backdrop!, 1920, 1080)).toBe(true);
      expect(inside(l.photo, 1920, 1080)).toBe(true);
    }
  });

  it('fills a 9:16 vertical video with a portrait phone photo', () => {
    const l = photoLayout(3000, 4000, 1080, 1920, 0.5);
    expect(l.backdrop).toBeNull();
    expect(covers(l.photo, 1080, 1920)).toBe(true);
  });

  it('zooms in slowly over the stop', () => {
    const start = photoLayout(4000, 3000, 1920, 1080, 0.0);
    const end = photoLayout(4000, 3000, 1920, 1080, 1.0);
    expect(end.photo.w / start.photo.w).toBeCloseTo(1.06, 9);
  });
});

describe('seedFromId', () => {
  it('is stable and spread over 0..1', () => {
    expect(seedFromId('abc')).toBe(seedFromId('abc'));
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'].map(seedFromId);
    expect(Math.min(...seeds)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seeds)).toBeLessThan(1);
    expect(new Set(seeds).size).toBe(6);
  });
});

describe('overlayOpacity', async () => {
  const { overlayOpacity } = await import('../src/render/overlays');
  const { createTimeline } = await import('../src/timeline/timeline');
  const { straight } = await import('./routes');
  const timeline = createTimeline(straight(0, 3000), {
    viewport: { width: 1280, height: 720 },
    travelDuration: 20,
    photos: [{ id: 'p', distance: 1500 }],
  });
  const at = (t: number, photo = 0) => overlayOpacity(timeline.at(t), timeline, photo);

  it('shows the title card at the start, then hides it', () => {
    expect(at(0).title).toBe(1);
    expect(at(3.5).title).toBe(0);
  });

  it('shows stats during travel but not on a photo or at the end', () => {
    expect(at(timeline.introDuration + 2).hud).toBe(1);
    expect(at(timeline.introDuration + 2, 1).hud).toBe(0);
    expect(at(timeline.duration).hud).toBe(0);
  });

  it('shows the end card only during the final hold', () => {
    expect(at(timeline.introDuration + 5).end).toBe(0);
    expect(at(timeline.duration).end).toBe(1);
  });
});
