import { describe, expect, it } from 'vitest';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  prefersPace,
} from '../src/ui/format';

describe('format', () => {
  it('formats distance in m below 1 km, then km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(999.4)).toBe('999 m');
    expect(formatDistance(12_345)).toBe('12.35 km');
    expect(formatDistance(160_934)).toBe('160.9 km');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600 + 5 * 60 + 7)).toBe('1:05:07');
  });

  it('formats speed as km/h', () => {
    expect(formatSpeed(null)).toBe('–');
    expect(formatSpeed(10)).toBe('36.0 km/h');
  });

  it('formats pace as min/km', () => {
    expect(formatPace(1000 / 300)).toBe('5:00 /km');
    expect(formatPace(1000 / 359.6)).toBe('6:00 /km');
    expect(formatPace(0)).toBe('–');
    expect(formatPace(0.1)).toBe('–');
  });

  it('formats elevation', () => {
    expect(formatElevation(1234.6)).toBe('1,235 m');
    expect(formatElevation(null)).toBe('–');
  });

  it('chooses pace for foot sports', () => {
    expect(prefersPace('running')).toBe(true);
    expect(prefersPace('Hiking')).toBe(true);
    expect(prefersPace('cycling')).toBe(false);
    expect(prefersPace(null)).toBe(false);
  });
});
