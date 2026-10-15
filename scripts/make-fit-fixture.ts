/**
 * Generates tests/fixtures/simple.fit with the same geometry as simple.gpx and simple.tcx,
 * so all parsers can be checked against one set of hand-computed expectations.
 *
 * Run with: pnpm fixtures:fit  (Node 24 runs this TypeScript file directly)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FitBaseType, FitEncoder } from 'fit-file-parser/encoder';

const START = Date.parse('2026-06-01T08:00:00Z');
const LON = 7.0;
const LAT0 = 46.0;
const STEP = 0.0005; // degrees of latitude between moving points (~55.6 m)

// [seconds since start, latitude steps north, elevation m, heart rate, cadence, power, temp °C]
const POINTS: [number, number, number, number, number, number, number][] = [
  [0, 0, 100, 120, 80, 200, 18],
  [10, 1, 101, 125, 82, 210, 18],
  [20, 2, 103, 130, 84, 220, 18],
  [30, 3, 106, 135, 86, 230, 19],
  [40, 4, 110, 140, 88, 240, 19],
  [50, 5, 108, 138, 0, 0, 19],
  [110, 5, 108, 110, 0, 0, 20],
  [120, 6, 104, 128, 80, 200, 20],
  [130, 7, 105, 132, 82, 210, 20],
  [140, 8, 112, 145, 84, 250, 21],
  [150, 9, 115, 150, 86, 260, 21],
];

const toSemicircles = (deg: number) => Math.round(deg * (2 ** 31 / 180));

const encoder = new FitEncoder();

// file_id (0): type = activity (4)
encoder.writeMessage(0, [
  { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },
  {
    number: 4,
    size: 4,
    baseType: FitBaseType.Uint32,
    value: FitEncoder.toFitTimestamp(new Date(START)),
  },
]);

// record (20) messages
for (const [t, steps, ele, hr, cad, power, temp] of POINTS) {
  encoder.writeMessage(
    20,
    [
      {
        number: 253,
        size: 4,
        baseType: FitBaseType.Uint32,
        value: FitEncoder.toFitTimestamp(new Date(START + t * 1000)),
      },
      {
        number: 0,
        size: 4,
        baseType: FitBaseType.Sint32,
        value: toSemicircles(LAT0 + steps * STEP),
      },
      { number: 1, size: 4, baseType: FitBaseType.Sint32, value: toSemicircles(LON) },
      // altitude: scale 5, offset 500
      { number: 2, size: 2, baseType: FitBaseType.Uint16, value: Math.round((ele + 500) * 5) },
      { number: 3, size: 1, baseType: FitBaseType.Uint8, value: hr },
      { number: 4, size: 1, baseType: FitBaseType.Uint8, value: cad },
      { number: 7, size: 2, baseType: FitBaseType.Uint16, value: power },
      { number: 13, size: 1, baseType: FitBaseType.Sint8, value: temp },
    ],
    1,
  );
}

// A record with no GPS fix (heart rate only), as watches write before satellites lock.
encoder.writeMessage(
  20,
  [
    {
      number: 253,
      size: 4,
      baseType: FitBaseType.Uint32,
      value: FitEncoder.toFitTimestamp(new Date(START + 155 * 1000)),
    },
    { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 140 },
  ],
  2,
);

// session (18): sport = running (1)
encoder.writeMessage(18, [{ number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 }], 3);

const out = fileURLToPath(new URL('../tests/fixtures/simple.fit', import.meta.url));
writeFileSync(out, encoder.close());
console.log(`Wrote ${out}`);
