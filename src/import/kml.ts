import { ImportError, isValidPosition, type Track, type TrackPoint } from './types';
import { child, descendants, firstDescendant, parseXml, text, time } from './xml';

/**
 * KML has two ways to store a path:
 * - `<gx:Track>` with parallel `<when>` and `<gx:coord>` lists (timed, from trackers), and
 * - `<LineString><coordinates>` (untimed, from planners or Google Earth).
 * We prefer gx:Track and fall back to LineString.
 */
export function parseKml(xml: string): Track {
  const doc = parseXml(xml);
  if (doc.documentElement.localName !== 'kml') {
    throw new ImportError('Not a KML file (missing <kml> root element).');
  }

  const points: TrackPoint[] = [];
  const tracks = descendants(doc, 'Track');
  if (tracks.length > 0) {
    for (const track of tracks) points.push(...readGxTrack(track));
  } else {
    for (const line of descendants(doc, 'LineString')) {
      points.push(...readCoordinates(text(child(line, 'coordinates')) ?? ''));
    }
  }

  const placemark = firstDescendant(doc, 'Placemark');
  const document = firstDescendant(doc, 'Document');
  return {
    name: text(placemark && child(placemark, 'name')) ?? text(document && child(document, 'name')),
    sport: null,
    source: 'kml',
    points,
  };
}

function readGxTrack(track: Element): TrackPoint[] {
  const whens = Array.from(track.children).filter((el) => el.localName === 'when');
  const coords = Array.from(track.children).filter((el) => el.localName === 'coord');
  const points: TrackPoint[] = [];
  coords.forEach((coord, i) => {
    // gx:coord is "lon lat [alt]", space separated.
    const [lon = NaN, lat = NaN, alt] = (text(coord) ?? '').split(/\s+/).map(Number);
    if (!isValidPosition(lat, lon)) return;
    const when = whens[i];
    points.push({
      lat,
      lon,
      ele: alt !== undefined && Number.isFinite(alt) ? alt : null,
      time: when ? time(when) : null,
    });
  });
  return points;
}

function readCoordinates(value: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  // <coordinates> is "lon,lat[,alt]" tuples separated by whitespace.
  for (const tuple of value.split(/\s+/)) {
    if (!tuple) continue;
    const [lon = NaN, lat = NaN, alt] = tuple.split(',').map(Number);
    if (!isValidPosition(lat, lon)) continue;
    points.push({
      lat,
      lon,
      ele: alt !== undefined && Number.isFinite(alt) ? alt : null,
      time: null,
    });
  }
  return points;
}
