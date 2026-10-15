import type { TerrainSource } from '../basemaps/terrain';
import type { ElevationFn } from '../camera/clearance';
import type { BBox } from '../track/geo';

/** Ground the camera can see beyond the route: room for the camera's distance behind it. */
const MARGIN_M = 6000;
const MAX_TILES = 64;
const CONCURRENCY = 6;

interface Tile {
  size: number;
  /** Elevations in metres, row by row. */
  heights: Float32Array;
}

/**
 * Downloads and decodes the terrain tiles covering a route (plus a margin for the camera) at
 * one zoom level, and returns a terrain height lookup. The camera's pitch profile uses this,
 * not the live map's terrain, so preview and export use exactly the same heights whatever the
 * map has loaded (DECISIONS.md, D30).
 */
export async function loadElevation(
  [west, south, east, north]: BBox,
  terrain: TerrainSource,
  signal?: AbortSignal,
): Promise<ElevationFn> {
  const latMargin = MARGIN_M / 111_195;
  const lonMargin = MARGIN_M / (111_195 * Math.cos((((south + north) / 2) * Math.PI) / 180));
  const box: BBox = [west - lonMargin, south - latMargin, east + lonMargin, north + latMargin];

  const source = terrain.source;
  const template = source.tiles?.[0];
  if (!template) throw new Error('Terrain source has no tile URL');
  let z = Math.min(12, source.maxzoom ?? 12);
  let range = tileRange(box, z);
  while (range.count > MAX_TILES && z > 6) range = tileRange(box, --z);

  const tiles = new Map<string, Tile | null>();
  const jobs: [number, number][] = [];
  for (let x = range.x0; x <= range.x1; x++) {
    for (let y = range.y0; y <= range.y1; y++) jobs.push([x, y]);
  }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (jobs.length > 0) {
        const [x, y] = jobs.pop()!;
        const url = template
          .replace('{z}', String(z))
          .replace('{x}', String(x))
          .replace('{y}', String(y));
        tiles.set(`${x}/${y}`, await fetchTile(url, signal));
      }
    }),
  );

  const n = 2 ** z;
  return (lon, lat) => {
    const fx = ((lon + 180) / 360) * n;
    const sin = Math.sin((lat * Math.PI) / 180);
    const fy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n;
    const tile = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`);
    if (!tile) return null;
    // Bilinear interpolation between the four nearest pixels.
    const px = (fx - Math.floor(fx)) * tile.size - 0.5;
    const py = (fy - Math.floor(fy)) * tile.size - 0.5;
    const x0 = Math.max(0, Math.min(tile.size - 1, Math.floor(px)));
    const y0 = Math.max(0, Math.min(tile.size - 1, Math.floor(py)));
    const x1 = Math.min(tile.size - 1, x0 + 1);
    const y1 = Math.min(tile.size - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, px - x0));
    const ty = Math.max(0, Math.min(1, py - y0));
    const h = (x: number, y: number) => tile.heights[y * tile.size + x]!;
    const top = h(x0, y0) + (h(x1, y0) - h(x0, y0)) * tx;
    const bottom = h(x0, y1) + (h(x1, y1) - h(x0, y1)) * tx;
    return top + (bottom - top) * ty;
  };
}

function tileRange([west, south, east, north]: BBox, z: number) {
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return Math.floor((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n);
  };
  const x0 = Math.max(0, tx(west));
  const x1 = Math.min(n - 1, tx(east));
  const y0 = Math.max(0, ty(north));
  const y1 = Math.min(n - 1, ty(south));
  return { x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

/** Fetches and decodes one Terrarium tile; null if missing (e.g. ocean, 404). */
async function fetchTile(url: string, signal?: AbortSignal): Promise<Tile | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    // Raw RGB values are data, not colours: no colour-space conversion or premultiplication.
    const bitmap = await createImageBitmap(await res.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const size = bitmap.width;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, size, size).data;
    const heights = new Float32Array(size * size);
    for (let i = 0; i < heights.length; i++) {
      // Terrarium encoding: (R * 256 + G + B / 256) - 32768 metres.
      heights[i] = rgba[i * 4]! * 256 + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! / 256 - 32768;
    }
    return { size, heights };
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
