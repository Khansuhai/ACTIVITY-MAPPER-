/** One GPS sample. Every parser produces these, whatever the file format. */
export interface TrackPoint {
  lat: number;
  lon: number;
  /** Elevation in metres, or null when the file has none for this point. */
  ele: number | null;
  /** Timestamp in epoch milliseconds, or null (planned routes often have no times). */
  time: number | null;
  /** Heart rate, beats per minute. */
  hr?: number;
  /** Cadence, rpm (or steps per minute per foot for running, as the device reports it). */
  cad?: number;
  /** Power, watts. */
  power?: number;
  /** Temperature, °C. */
  temp?: number;
}

export type TrackSource = 'gpx' | 'tcx' | 'fit' | 'kml';

export interface Track {
  /** Activity name from the file, or null. The UI falls back to the file name. */
  name: string | null;
  /** Sport as written in the file (for example "running", "Biking", "cycling"), or null. */
  sport: string | null;
  source: TrackSource;
  points: TrackPoint[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Rejects NaN, out-of-range values and the (0, 0) "no fix" placeholder some devices write. */
export function isValidPosition(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}
