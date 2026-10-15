import { ImportError, isValidPosition, type Track, type TrackPoint } from './types';
import { child, descendants, firstDescendant, num, parseXml, text, time } from './xml';

/** Extension element names (lower-cased local names) mapped to TrackPoint sensor fields. */
const EXTENSION_FIELDS: Record<string, 'hr' | 'cad' | 'power' | 'temp'> = {
  hr: 'hr',
  heartrate: 'hr',
  cad: 'cad',
  cadence: 'cad',
  power: 'power',
  watts: 'power',
  atemp: 'temp',
  temp: 'temp',
  wtemp: 'temp',
};

export function parseGpx(xml: string): Track {
  const doc = parseXml(xml);
  if (doc.documentElement.localName !== 'gpx') {
    throw new ImportError('Not a GPX file (missing <gpx> root element).');
  }

  // Recorded tracks first; fall back to a planned route (<rte>) if there is no track.
  let pointElements = descendants(doc, 'trkpt');
  if (pointElements.length === 0) pointElements = descendants(doc, 'rtept');

  const points: TrackPoint[] = [];
  for (const el of pointElements) {
    const point = readPoint(el);
    if (point) points.push(point);
  }

  const trk = firstDescendant(doc, 'trk') ?? firstDescendant(doc, 'rte');
  const metadata = firstDescendant(doc, 'metadata');
  return {
    name: text(trk && child(trk, 'name')) ?? text(metadata && child(metadata, 'name')),
    sport: text(trk && child(trk, 'type')),
    source: 'gpx',
    points,
  };
}

function readPoint(el: Element): TrackPoint | null {
  const lat = Number.parseFloat(el.getAttribute('lat') ?? '');
  const lon = Number.parseFloat(el.getAttribute('lon') ?? '');
  if (!isValidPosition(lat, lon)) return null;

  const point: TrackPoint = {
    lat,
    lon,
    ele: num(child(el, 'ele')),
    time: time(child(el, 'time')),
  };

  const extensions = child(el, 'extensions');
  if (extensions) {
    for (const ext of Array.from(extensions.getElementsByTagName('*'))) {
      const field = EXTENSION_FIELDS[ext.localName.toLowerCase()];
      if (!field || ext.children.length > 0) continue;
      const value = num(ext);
      if (value !== null && point[field] === undefined) point[field] = value;
    }
  }
  return point;
}
