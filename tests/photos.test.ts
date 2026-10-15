import { describe, expect, it } from 'vitest';
import { importActivity, type TrackPoint } from '../src/import';
import { readPhotoMeta } from '../src/photos/exif';
import { extractHeifExif, isHeif } from '../src/photos/heif';
import {
  estimateClockCorrection,
  MAX_OFF_ROUTE_M,
  placePhoto,
  TrackIndex,
  type PhotoInput,
} from '../src/photos/place';
import { parseExifDateTime, parseUtcOffset, photoInstant } from '../src/photos/time';
import { fixture, M_PER_DEG, SIMPLE } from './helpers';

const STEP_M = 0.0005 * M_PER_DEG; // one step of the simple fixtures (~55.6 m)
const utc = (iso: string) => Date.parse(iso);

describe('EXIF time', () => {
  it('parses wall-clock time without applying any time zone', () => {
    expect(parseExifDateTime('2026:06:01 10:00:30')).toBe(utc('2026-06-01T10:00:30Z'));
    expect(parseExifDateTime('2026-06-01T10:00:30')).toBe(utc('2026-06-01T10:00:30Z'));
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDateTime('garbage')).toBeNull();
    expect(parseExifDateTime(null)).toBeNull();
  });

  it('parses UTC offsets', () => {
    expect(parseUtcOffset('+02:00')).toBe(120);
    expect(parseUtcOffset('-05:30')).toBe(-330);
    expect(parseUtcOffset('+0545')).toBe(345);
    expect(parseUtcOffset('Z')).toBe(0);
    expect(parseUtcOffset('+25:00')).toBeNull();
    expect(parseUtcOffset(undefined)).toBeNull();
  });

  it('combines local time, offset and clock correction into an instant', () => {
    const local = parseExifDateTime('2026:06:01 10:00:30');
    expect(photoInstant(local, 120, 0)).toBe(utc('2026-06-01T08:00:30Z'));
    // No offset tag: the fallback (normally the browser's zone) is used.
    expect(photoInstant(local, null, 0, () => -300)).toBe(utc('2026-06-01T15:00:30Z'));
    // Camera clock 5 minutes slow: +5 min correction.
    expect(photoInstant(local, 120, 5 * 60_000)).toBe(utc('2026-06-01T08:05:30Z'));
    expect(photoInstant(null, 120, 0)).toBeNull();
  });
});

describe('HEIF', () => {
  it('recognises HEIC by its ftyp brands', () => {
    expect(isHeif(new Uint8Array(fixture('photos/gps-time.heic')))).toBe(true);
    expect(isHeif(new Uint8Array(fixture('photos/gps-time.jpg')))).toBe(false);
    expect(isHeif(new Uint8Array(4))).toBe(false);
  });

  it('extracts the TIFF EXIF block, honouring the iloc base offset', () => {
    const tiff = extractHeifExif(new Uint8Array(fixture('photos/gps-time.heic')))!;
    expect(String.fromCharCode(...tiff.subarray(0, 4))).toBe('MM\0*');
  });

  it('returns null for files without metadata boxes', () => {
    expect(extractHeifExif(new Uint8Array(fixture('photos/gps-time.jpg')))).toBeNull();
  });
});

describe('readPhotoMeta', () => {
  it('reads GPS, local time and offset from a JPEG', async () => {
    const meta = await readPhotoMeta(fixture('photos/gps-time.jpg'));
    expect(meta).toEqual({
      localTime: utc('2026-06-01T10:00:30Z'),
      utcOffsetMinutes: 120,
      gps: { lat: 46.0015, lon: 7 },
      orientation: 1,
      heif: false,
    });
  });

  it('reads a HEIC file (whose iloc uses a base offset, which exifr alone mishandles)', async () => {
    const meta = await readPhotoMeta(fixture('photos/gps-time.heic'));
    expect(meta.heif).toBe(true);
    expect(meta.gps).toEqual({ lat: 46.0035, lon: 7 });
    expect(meta.localTime).toBe(utc('2026-06-01T10:02:00Z'));
    expect(meta.utcOffsetMinutes).toBe(120);
  });

  it('handles time-only, GPS-only, rotated and metadata-free photos', async () => {
    expect(await readPhotoMeta(fixture('photos/time-only.jpg'))).toMatchObject({
      gps: null,
      utcOffsetMinutes: 120,
    });
    expect(await readPhotoMeta(fixture('photos/gps-only.jpg'))).toMatchObject({
      localTime: null,
      gps: { lat: 46.0045, lon: 7.00001 },
    });
    expect(await readPhotoMeta(fixture('photos/rotated.jpg'))).toMatchObject({
      orientation: 6,
      utcOffsetMinutes: null,
    });
    expect(await readPhotoMeta(fixture('photos/no-meta.jpg'))).toEqual({
      localTime: null,
      utcOffsetMinutes: null,
      gps: null,
      orientation: 1,
      heif: false,
    });
  });

  it('treats random bytes as a photo without metadata', async () => {
    const meta = await readPhotoMeta(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    expect(meta.gps).toBeNull();
    expect(meta.localTime).toBeNull();
  });
});

describe('placePhoto on the simple track', async () => {
  const track = await importActivity(fixture('simple.fit'));
  const index = new TrackIndex(track.points);
  const place = async (file: string, fallbackOffset = 120) => {
    const meta = await readPhotoMeta(fixture(`photos/${file}`));
    const time = photoInstant(meta.localTime, meta.utcOffsetMinutes, 0, () => fallbackOffset);
    return placePhoto(index, { gps: meta.gps, time });
  };

  it('snaps a GPS photo to the route', async () => {
    const p = await place('gps-time.jpg');
    expect(p.method).toBe('gps');
    if (p.method !== 'gps') return;
    expect(p.distance).toBeCloseTo(3 * STEP_M, 0);
    expect(p.offRouteM).toBeLessThan(1);
  });

  it('places a photo without GPS by its time', async () => {
    // 10:02:10 +02:00 = 08:02:10Z = 130 s after the start = 7 steps along.
    const p = await place('time-only.jpg');
    expect(p).toMatchObject({ method: 'time' });
    if (p.method === 'time') expect(p.distance).toBeCloseTo(7 * STEP_M, 0);
  });

  it('places a photo without time by GPS alone', async () => {
    const p = await place('gps-only.jpg');
    expect(p.method).toBe('gps');
    if (p.method === 'gps') expect(p.distance).toBeCloseTo(SIMPLE.distance, 0);
  });

  it('uses the fallback time zone when the camera wrote none', async () => {
    // rotated.jpg: 10:00:00 with no offset tag. At +02:00 that is the start of the track.
    expect(await place('rotated.jpg', 120)).toMatchObject({ method: 'time', distance: 0 });
    // At +03:00 it would be an hour before the start: outside the activity.
    expect(await place('rotated.jpg', 180)).toEqual({ method: 'none', reason: 'outside-activity' });
  });

  it('leaves photos without metadata unplaced', async () => {
    expect(await place('no-meta.jpg')).toEqual({ method: 'none', reason: 'no-metadata' });
  });
});

/** North for 1 km and straight back, one point per second at 2 m/s. */
function outAndBack(): TrackPoint[] {
  const out = Array.from({ length: 501 }, (_, i) => i * 2);
  const metres = [...out, ...out.slice(0, -1).reverse()];
  return metres.map((m, i) => ({
    lat: 46 + m / M_PER_DEG,
    lon: 7,
    ele: null,
    time: Date.UTC(2026, 6, 1, 8) + i * 1000,
  }));
}

describe('placePhoto on routes that pass the same place twice', () => {
  const points = outAndBack();
  const index = new TrackIndex(points);
  const at300 = { lat: 46 + 300 / M_PER_DEG, lon: 7 };
  const start = points[0]!.time!;

  it('uses the time to pick the pass', () => {
    // 300 m out is reached at 150 s; on the way back at 850 s.
    const outward = placePhoto(index, { gps: at300, time: start + 150_000 });
    const back = placePhoto(index, { gps: at300, time: start + 850_000 });
    expect(outward.method === 'gps' && outward.distance).toBeCloseTo(300, 0);
    expect(back.method === 'gps' && back.distance).toBeCloseTo(1700, 0);
  });

  it('falls back to the first nearest pass without a time', () => {
    const p = placePhoto(index, { gps: at300, time: null });
    expect(p.method === 'gps' && p.distance).toBeCloseTo(300, 0);
  });

  it('rejects GPS far from the route unless the time can place it', () => {
    const far = { lat: 46.1, lon: 7.1 };
    expect(placePhoto(index, { gps: far, time: null })).toEqual({
      method: 'none',
      reason: 'off-route',
    });
    const byTime = placePhoto(index, { gps: far, time: start + 100_000 });
    expect(byTime.method).toBe('time');
    expect(MAX_OFF_ROUTE_M).toBe(1000);
  });

  it('places photos slightly outside the recording at the ends, but not long after', () => {
    const end = points.at(-1)!.time!;
    expect(placePhoto(index, { gps: null, time: start - 60_000 })).toMatchObject({ distance: 0 });
    expect(placePhoto(index, { gps: null, time: end + 3_600_000 })).toEqual({
      method: 'none',
      reason: 'outside-activity',
    });
  });
});

describe('estimateClockCorrection', () => {
  // One-way route north, 2 m/s, so every position has one time.
  const points: TrackPoint[] = Array.from({ length: 1001 }, (_, i) => ({
    lat: 46 + (i * 2) / M_PER_DEG,
    lon: 7,
    ele: null,
    time: Date.UTC(2026, 6, 1, 8) + i * 1000,
  }));
  const index = new TrackIndex(points);

  it('finds a camera clock that is 7 minutes fast', () => {
    const photos: PhotoInput[] = [100, 400, 900, 1500].map((m) => ({
      gps: { lat: 46 + m / M_PER_DEG, lon: 7 },
      time: points[m / 2]!.time! + 7 * 60_000,
    }));
    expect(estimateClockCorrection(index, photos)).toBe(-7 * 60_000);
  });

  it('ignores an outlier thanks to the median', () => {
    const photos: PhotoInput[] = [100, 400, 900].map((m, i) => ({
      gps: { lat: 46 + m / M_PER_DEG, lon: 7 },
      time: points[m / 2]!.time! + (i === 2 ? 3_600_000 : 120_000),
    }));
    expect(estimateClockCorrection(index, photos)).toBe(-2 * 60_000);
  });

  it('returns null without usable photos', () => {
    expect(estimateClockCorrection(index, [{ gps: null, time: 0 }])).toBeNull();
  });
});
