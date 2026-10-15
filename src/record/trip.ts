import type { Track, TrackPoint } from '../import/types';
import type { RecordedPhoto } from './recorder';

/** A recorded activity saved on the phone. */
export interface Trip {
  id: string;
  name: string;
  /** Sport as a lower-case word ("running", "cycling", "hiking"…), used for icons and pace. */
  sport: string;
  /** Epoch ms when recording started. */
  createdAt: number;
  points: TrackPoint[];
  /** Index in `points` where each recording segment (between pauses) starts. */
  segmentStarts: number[];
  photos: RecordedPhoto[];
  /** Summary at save time, for the trip list. */
  distance: number;
  movingTime: number;
}

export const SPORTS = ['running', 'cycling', 'hiking', 'walking', 'skiing', 'kayaking', 'riding'];

/** A default name like "Morning run" from the start time and sport. */
export function defaultTripName(sport: string, start: number): string {
  const h = new Date(start).getHours();
  const part =
    h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  const noun: Record<string, string> = {
    running: 'run',
    cycling: 'ride',
    hiking: 'hike',
    walking: 'walk',
    skiing: 'ski',
    kayaking: 'paddle',
    riding: 'horse ride',
  };
  return `${part} ${noun[sport] ?? 'activity'}`;
}

export function tripToTrack(trip: Trip): Track {
  return { name: trip.name, sport: trip.sport, source: 'gpx', points: trip.points };
}

/**
 * GPX 1.1 for a trip: one track segment per recording segment, photos as waypoints. For sharing
 * the activity with other apps (Strava, Garmin Connect, Komoot…).
 */
export function tripToGpx(trip: Trip): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const iso = (t: number | null) => (t === null ? '' : `<time>${new Date(t).toISOString()}</time>`);
  const pt = (p: TrackPoint) =>
    `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
    `${p.ele === null ? '' : `<ele>${p.ele.toFixed(1)}</ele>`}${iso(p.time)}</trkpt>`;

  const starts = trip.segmentStarts.length ? trip.segmentStarts : [0];
  const segments = starts.map((start, i) => {
    const end = starts[i + 1] ?? trip.points.length;
    return `    <trkseg>\n${trip.points.slice(start, end).map(pt).join('\n')}\n    </trkseg>`;
  });
  const waypoints = trip.photos.map(
    (p, i) =>
      `  <wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${iso(p.time)}<name>Photo ${i + 1}</name></wpt>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="OpenFlyover" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${esc(trip.name)}</name>${iso(trip.createdAt)}</metadata>`,
    ...waypoints,
    '  <trk>',
    `    <name>${esc(trip.name)}</name>`,
    `    <type>${esc(trip.sport)}</type>`,
    ...segments,
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}
