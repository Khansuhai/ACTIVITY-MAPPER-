/**
 * Marker icons. The pictograms are our own simple line drawings on a 24x24 grid (white strokes
 * on the route-coloured disc); none are copied from other apps or icon sets.
 */

export const ICON_IDS = ['runner', 'bike', 'hiker', 'skier', 'kayak', 'horse'] as const;
export type IconId = (typeof ICON_IDS)[number];

export const ICON_NAMES: Record<IconId, string> = {
  runner: 'Runner',
  bike: 'Bike',
  hiker: 'Hiker',
  skier: 'Skier',
  kayak: 'Kayak',
  horse: 'Horse',
};

/** Marker choice: a plain dot, a built-in pictogram, or the user's own picture. */
export type MarkerChoice =
  { kind: 'dot' } | { kind: 'icon'; id: IconId } | { kind: 'custom'; bitmap: ImageBitmap };

interface Glyph {
  /** Stroked paths (SVG path syntax, 24x24 grid). */
  strokes: string[];
  /** Filled paths (heads). */
  fills: string[];
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx + r} ${cy}a${r} ${r} 0 1 1-${2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0`;

const GLYPHS: Record<IconId, Glyph> = {
  runner: {
    fills: [circle(14, 4.5, 2)],
    strokes: [
      'M12.5 8 10 14',
      'M7.5 10.5l3.5-2.5 3 1.5 2 3',
      'M10 14l3.5 3-1 4.5',
      'M10 14l-2.5 3.5H4.5',
    ],
  },
  bike: {
    fills: [circle(14.5, 3.8, 1.8)],
    strokes: [
      circle(6, 16.5, 3.8),
      circle(18, 16.5, 3.8),
      'M6 16.5 10 10h6l2 6.5',
      'M10 10l2.5 6.5H18',
      'M9 7.5h2.5',
    ],
  },
  hiker: {
    fills: [circle(11, 3.8, 2)],
    strokes: [
      'M11 7 10 14',
      'M10 8 7 9.5v4l3 .5',
      'M10 14l-2.5 7',
      'M10 14l3 3v4',
      'M10.5 9.5l4.5 1.5',
      'M15.5 8.5 17 21',
    ],
  },
  skier: {
    fills: [circle(15, 3.8, 2)],
    strokes: [
      'M14.5 7 10.5 12l3 3-2 4.5',
      'M12.5 9.5l4.5 2',
      'M17 11.5 15 20',
      'M10.5 12 7 11',
      'M3 17.5l18 4.5',
    ],
  },
  kayak: {
    fills: [circle(12, 5, 2)],
    strokes: [
      'M12 8.5v5',
      'M3 15.5c4.5 3 13.5 3 18 0',
      'M4.5 7.5 19.5 16.5',
      'M3.5 6.5l2.5 1.5',
      'M18 16l2.5 1.5',
    ],
  },
  horse: {
    fills: [],
    strokes: [
      'M5 12.5c0-2.5 2-3.5 4-3.5h6.5l3-3.5 2.5 1.5-1 3.5-2 1v2',
      'M5 12.5h13',
      'M6.5 12.5 5.5 20',
      'M9.5 12.5V20',
      'M15 12.5V20',
      'M18 12.5l.5 7.5',
      'M5 11.5 2.5 15.5',
    ],
  },
};

/** Guesses an icon from the file's sport ("running", "Biking", "alpine_skiing", ...). */
export function iconForSport(sport: string | null): IconId | null {
  if (!sport) return null;
  const s = sport.toLowerCase();
  if (/run|jog/.test(s)) return 'runner';
  if (/bik|cycl|ride|mtb/.test(s)) return 'bike';
  if (/hik|walk|trek|mountaineer/.test(s)) return 'hiker';
  if (/ski|snowboard/.test(s)) return 'skier';
  if (/kayak|canoe|paddl|row|sup/.test(s)) return 'kayak';
  if (/horse|equestr|riding/.test(s)) return 'horse';
  return null;
}

/** Diameter of the marker disc in CSS pixels. */
export const MARKER_SIZE = 34;

/**
 * The marker image: a disc in `color` with a white ring, containing the pictogram or the user's
 * picture (cover-cropped to a circle). Returns pixel data at `ratio` for MapLibre's addImage.
 */
export function markerImage(
  choice: Exclude<MarkerChoice, { kind: 'dot' }>,
  color: string,
  ratio: number,
): ImageData {
  const d = Math.round(MARKER_SIZE * ratio);
  const canvas = new OffscreenCanvas(d, d);
  const ctx = canvas.getContext('2d')!;
  const r = d / 2;
  const ring = 3 * ratio;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - ring, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, d, d);
  if (choice.kind === 'custom') {
    const b = choice.bitmap;
    const s = Math.max(d / b.width, d / b.height);
    ctx.drawImage(b, r - (b.width * s) / 2, r - (b.height * s) / 2, b.width * s, b.height * s);
  } else {
    const glyph = GLYPHS[choice.id];
    const inner = (d - 2 * ring) * 0.72;
    ctx.translate(r - inner / 2, r - inner / 2);
    ctx.scale(inner / 24, inner / 24);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of glyph.strokes) ctx.stroke(new Path2D(p));
    for (const p of glyph.fills) ctx.fill(new Path2D(p));
  }
  ctx.restore();
  return ctx.getImageData(0, 0, d, d);
}
