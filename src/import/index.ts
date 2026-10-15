import { parseFit } from './fit';
import { parseGpx } from './gpx';
import { parseKml } from './kml';
import { parseTcx } from './tcx';
import { ImportError, type Track, type TrackSource } from './types';

export { ImportError } from './types';
export type { Track, TrackPoint, TrackSource } from './types';

export const ACCEPTED_EXTENSIONS = ['.gpx', '.tcx', '.fit', '.kml'] as const;

/**
 * Detects the format from the content first (FIT signature, XML root element) and only then from
 * the file name, so a misnamed file still imports.
 */
export function detectFormat(bytes: Uint8Array, fileName = ''): TrackSource | null {
  // FIT header: byte 0 = header size, bytes 8..11 = ".FIT".
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(8, 12)) === '.FIT') {
    return 'fit';
  }

  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  const root = /<(?:[\w.-]+:)?(gpx|TrainingCenterDatabase|kml)[\s>]/.exec(head)?.[1];
  if (root === 'gpx') return 'gpx';
  if (root === 'TrainingCenterDatabase') return 'tcx';
  if (root === 'kml') return 'kml';

  const ext = /\.(gpx|tcx|fit|kml)$/i.exec(fileName)?.[1]?.toLowerCase();
  return (ext as TrackSource | undefined) ?? null;
}

/** Parses an activity file of any supported format into a Track. Runs fully in the browser. */
export async function importActivity(data: ArrayBuffer, fileName = ''): Promise<Track> {
  const bytes = new Uint8Array(data);
  const format = detectFormat(bytes, fileName);

  let track: Track;
  switch (format) {
    case 'fit':
      track = await parseFit(data);
      break;
    case 'gpx':
      track = parseGpx(decodeText(bytes));
      break;
    case 'tcx':
      track = parseTcx(decodeText(bytes));
      break;
    case 'kml':
      track = parseKml(decodeText(bytes));
      break;
    default:
      throw new ImportError(
        `Unsupported file. Please use one of: ${ACCEPTED_EXTENSIONS.join(', ')}.`,
      );
  }

  if (track.points.length < 2) {
    throw new ImportError('The file contains fewer than two GPS points, so there is no route.');
  }
  return track;
}

export function importFile(file: File): Promise<Track> {
  return file.arrayBuffer().then((data) => importActivity(data, file.name));
}

function decodeText(bytes: Uint8Array): string {
  // TextDecoder strips a UTF-8 byte order mark, which DOMParser would otherwise reject.
  return new TextDecoder().decode(bytes);
}
