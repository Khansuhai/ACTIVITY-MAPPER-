import FitParser from 'fit-file-parser';
import { ImportError, isValidPosition, type Track, type TrackPoint } from './types';

type FitRecord = Record<string, unknown>;

export async function parseFit(data: ArrayBuffer): Promise<Track> {
  const parser = new FitParser({
    mode: 'list',
    lengthUnit: 'm',
    speedUnit: 'm/s',
    temperatureUnit: 'celsius',
  });

  let parsed;
  try {
    parsed = await parser.parseAsync(data);
  } catch (error) {
    // The callback API reports some errors as plain strings.
    const reason = error instanceof Error ? error.message : String(error);
    throw new ImportError(`Could not read the FIT file: ${reason}`);
  }

  const points: TrackPoint[] = [];
  for (const record of (parsed.records ?? []) as FitRecord[]) {
    const point = readRecord(record);
    if (point) points.push(point);
  }

  const session = (parsed.sessions?.[0] ?? {}) as FitRecord;
  return {
    name: null,
    sport: typeof session.sport === 'string' ? session.sport : null,
    source: 'fit',
    points,
  };
}

function readRecord(record: FitRecord): TrackPoint | null {
  const lat = numberField(record, 'position_lat');
  const lon = numberField(record, 'position_long');
  // Records without a position are sensor-only samples (no GPS fix yet, indoor, etc.).
  if (lat === undefined || lon === undefined || !isValidPosition(lat, lon)) return null;

  const timestamp = record.timestamp;
  const point: TrackPoint = {
    lat,
    lon,
    // Newer devices write enhanced_altitude (wider range); prefer it when present.
    ele: numberField(record, 'enhanced_altitude') ?? numberField(record, 'altitude') ?? null,
    time: timestamp instanceof Date ? timestamp.getTime() : null,
  };

  const hr = numberField(record, 'heart_rate');
  if (hr !== undefined) point.hr = hr;
  const cad = numberField(record, 'cadence');
  if (cad !== undefined) point.cad = cad;
  const power = numberField(record, 'power');
  if (power !== undefined) point.power = power;
  const temp = numberField(record, 'temperature');
  if (temp !== undefined) point.temp = temp;
  return point;
}

function numberField(record: FitRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
