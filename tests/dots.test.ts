import { describe, expect, it } from 'vitest';
import { metersPerPixel } from '../src/camera/camera';
import { dotIndex, dotSpacing, MAX_DOTS, routeDots } from '../src/render/dots';
import { createSampler } from '../src/track/sampler';
import { straight } from './routes';

describe('route dots', () => {
  it('spaces dots about one pixel apart at the chase zoom', () => {
    expect(dotSpacing(10_000, 15, 46)).toBeCloseTo(metersPerPixel(15, 46), 9);
    expect(dotSpacing(10_000, 20, 46)).toBe(0.5); // never closer than 0.5 m
    expect(dotSpacing(10_000, 5, 46)).toBe(25); // never further than 25 m
  });

  it('caps the number of dots on very long routes', () => {
    const spacing = dotSpacing(5_000_000, 15, 46);
    expect(5_000_000 / spacing).toBeLessThanOrEqual(MAX_DOTS);
  });

  it('places dots along the route, including the very end', () => {
    const sampler = createSampler(straight(0, 1000));
    const dots = routeDots(sampler, 100);
    expect(dots).toHaveLength(11);
    const end = sampler.at(1000);
    expect(dots.at(-1)).toEqual([end.lon, end.lat]);
  });

  it('finds the marker dot for a distance', () => {
    expect(dotIndex(0, 2, 10)).toBe(0);
    expect(dotIndex(5.9, 2, 10)).toBe(2);
    expect(dotIndex(6, 2, 10)).toBe(3);
    expect(dotIndex(1e9, 2, 10)).toBe(9);
    expect(dotIndex(-5, 2, 10)).toBe(0);
  });
});
