import { ImportError, isValidPosition, type Track, type TrackPoint } from './types';
import { child, descendants, firstDescendant, num, parseXml, text, time } from './xml';

export function parseTcx(xml: string): Track {
  const doc = parseXml(xml);
  if (doc.documentElement.localName !== 'TrainingCenterDatabase') {
    throw new ImportError('Not a TCX file (missing <TrainingCenterDatabase> root element).');
  }

  // Trackpoints across all laps, in document order. Points without a position (written while
  // GPS has no fix, or on indoor activities) are skipped.
  const points: TrackPoint[] = [];
  for (const el of descendants(doc, 'Trackpoint')) {
    const point = readPoint(el);
    if (point) points.push(point);
  }

  const activity = firstDescendant(doc, 'Activity');
  const course = firstDescendant(doc, 'Course');
  return {
    name: text(firstDescendant(doc, 'Notes')) ?? text(course && child(course, 'Name')),
    sport: activity?.getAttribute('Sport') ?? null,
    source: 'tcx',
    points,
  };
}

function readPoint(el: Element): TrackPoint | null {
  const position = child(el, 'Position');
  if (!position) return null;
  const lat = num(child(position, 'LatitudeDegrees'));
  const lon = num(child(position, 'LongitudeDegrees'));
  if (lat === null || lon === null || !isValidPosition(lat, lon)) return null;

  const point: TrackPoint = {
    lat,
    lon,
    ele: num(child(el, 'AltitudeMeters')),
    time: time(child(el, 'Time')),
  };

  const heartRate = child(el, 'HeartRateBpm');
  const hr = num(heartRate && child(heartRate, 'Value'));
  if (hr !== null) point.hr = hr;

  const cad = num(child(el, 'Cadence')) ?? num(firstDescendant(el, 'RunCadence'));
  if (cad !== null) point.cad = cad;

  const power = num(firstDescendant(el, 'Watts'));
  if (power !== null) point.power = power;

  return point;
}
