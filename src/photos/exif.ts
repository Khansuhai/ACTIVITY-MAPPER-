import exifr from 'exifr';
import { extractHeifExif, isHeif } from './heif';
import { parseExifDateTime, parseUtcOffset } from './time';

/** What we need from a photo's metadata. */
export interface PhotoMeta {
  /** Wall-clock time taken, as epoch ms *as if UTC* (see parseExifDateTime), or null. */
  localTime: number | null;
  /** OffsetTimeOriginal in minutes east of UTC, or null when the camera did not write it. */
  utcOffsetMinutes: number | null;
  gps: { lat: number; lon: number } | null;
  /** EXIF orientation 1..8 (browsers apply it when decoding). */
  orientation: number;
  heif: boolean;
}

const FIELDS = [
  'DateTimeOriginal',
  'CreateDate',
  'OffsetTimeOriginal',
  'OffsetTime',
  'Orientation',
  'latitude',
  'longitude',
];

/** Reads date, time zone, GPS and orientation from a JPEG, HEIC, PNG, WebP or TIFF. */
export async function readPhotoMeta(data: ArrayBuffer): Promise<PhotoMeta> {
  const bytes = new Uint8Array(data);
  const heif = isHeif(bytes);
  // For HEIF, hand exifr only the TIFF block (see heif.ts for why).
  const input = heif ? extractHeifExif(bytes) : bytes;

  let raw: Record<string, unknown> | undefined;
  if (input) {
    try {
      raw = await exifr.parse(input, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: false,
        icc: false,
        iptc: false,
        // Keep DateTimeOriginal as a string: reviving it would apply the browser's time zone.
        reviveValues: false,
        translateValues: false,
        pick: FIELDS,
      });
    } catch {
      raw = undefined; // unreadable metadata is the same as none
    }
  }

  const lat = raw?.latitude;
  const lon = raw?.longitude;
  const gpsValid =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);

  return {
    localTime: parseExifDateTime(str(raw?.DateTimeOriginal) ?? str(raw?.CreateDate)),
    utcOffsetMinutes: parseUtcOffset(str(raw?.OffsetTimeOriginal) ?? str(raw?.OffsetTime)),
    gps: gpsValid ? { lat, lon } : null,
    orientation: typeof raw?.Orientation === 'number' ? raw.Orientation : 1,
    heif,
  };
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
