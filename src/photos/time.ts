/**
 * Photo timestamps. EXIF DateTimeOriginal is wall-clock time with no time zone; phones also write
 * OffsetTimeOriginal ("+02:00"). We keep them separate and never let a library turn the local
 * time into a Date, which would silently apply the browser's time zone.
 */

/**
 * "2026:06:01 10:00:30" -> the same wall-clock time as epoch ms *as if it were UTC*, or null.
 * Subtract the UTC offset to get the real instant.
 */
export function parseExifDateTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/** "+02:00" / "-0530" / "Z" -> minutes east of UTC, or null. */
export function parseUtcOffset(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (v === 'Z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(v);
  if (!m) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (minutes > 14 * 60) return null;
  return m[1] === '-' ? -minutes : minutes;
}

/** Offset of the browser's time zone at a given wall-clock time, in minutes east of UTC. */
export function browserUtcOffset(localAsUtcMs: number): number {
  const d = new Date(localAsUtcMs);
  const local = new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  );
  return -local.getTimezoneOffset();
}

/**
 * The instant a photo was taken (epoch ms), or null without a timestamp.
 *
 * @param localAsUtcMs wall-clock time from parseExifDateTime
 * @param utcOffsetMinutes the photo's OffsetTimeOriginal, or null to use `fallbackOffset`
 * @param clockCorrectionMs user's camera-clock correction, added at the end
 */
export function photoInstant(
  localAsUtcMs: number | null,
  utcOffsetMinutes: number | null,
  clockCorrectionMs: number,
  fallbackOffset: (localAsUtcMs: number) => number = browserUtcOffset,
): number | null {
  if (localAsUtcMs === null) return null;
  const offset = utcOffsetMinutes ?? fallbackOffset(localAsUtcMs);
  return localAsUtcMs - offset * 60_000 + clockCorrectionMs;
}
