import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Reads a fixture as an ArrayBuffer, the same input the browser gets from File.arrayBuffer(). */
export function fixture(name: string): ArrayBuffer {
  // A path, not new URL(): jsdom replaces the global URL class in DOM test files.
  const buf = readFileSync(join(import.meta.dirname, 'fixtures', name));
  // Copy into an ArrayBuffer from the test's own realm: fit-file-parser checks
  // `instanceof ArrayBuffer`, which fails for Node Buffer memory under jsdom.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

/** Metres per degree of latitude with the IUGG mean Earth radius. */
export const M_PER_DEG = (Math.PI / 180) * 6_371_008.8;

/**
 * All "simple" fixtures share one geometry: points due north along 7°E, 0.0005° of latitude and
 * 10 s apart, with a 60 s stop after the 6th point. Expected values are worked out by hand.
 */
export const SIMPLE = {
  pointCount: 11,
  start: Date.parse('2026-06-01T08:00:00Z'),
  /** 9 moving segments of 0.0005° of latitude on a meridian. */
  distance: 9 * 0.0005 * M_PER_DEG,
  elapsedTime: 150,
  movingTime: 90,
  segmentSpeed: (0.0005 * M_PER_DEG) / 10,
  // Elevations 100,101,103,106,110,108,108,104,105,112,115 with a 3 m hysteresis:
  // gains 3+3+4+8+3, one loss of 6.
  elevationGain: 21,
  elevationLoss: 6,
  minElevation: 100,
  maxElevation: 115,
} as const;
