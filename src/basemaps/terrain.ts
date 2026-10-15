import type { RasterDEMSourceSpecification } from 'maplibre-gl';

/** Elevation (DEM) tile sources for 3D terrain and hillshade, with their terms. */
export interface TerrainSource {
  id: string;
  name: string;
  source: RasterDEMSourceSpecification;
  /** Plain-text credit burned into exported videos. */
  credit: string;
  license: string;
}

export const TERRAIN_SOURCES = [
  {
    id: 'mapterhorn',
    name: 'Mapterhorn',
    source: {
      type: 'raster-dem',
      tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
      encoding: 'terrarium',
      tileSize: 512,
      attribution:
        '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>',
    },
    credit: 'Terrain © Mapterhorn',
    license:
      'Mapterhorn (BSD-3 code, open data): Copernicus GLO-30 worldwide plus national lidar DEMs ' +
      '(CC BY, CC0, open government licences; none non-commercial). Attribution string from its ' +
      'TileJSON. No key. Checked 2026-10. Above z12 only high-resolution regions exist; elsewhere ' +
      'tiles 404 and MapLibre overscales the z12 parent.',
  },
  {
    id: 'aws-terrarium',
    name: 'AWS Terrain Tiles',
    source: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution:
        '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Terrain: Mapzen, USGS SRTM/GMTED2010/3DEP, Copernicus EU-DEM and others</a>',
    },
    credit: 'Terrain: Mapzen, USGS, Copernicus and others',
    license:
      'AWS Open Data Terrain Tiles (Mapzen/Joerd): open data, attribution required per source ' +
      '(see joerd docs/attribution.md). Fallback only: coarser than Mapterhorn.',
  },
] as const satisfies readonly TerrainSource[];

export const DEFAULT_TERRAIN: TerrainSource = TERRAIN_SOURCES[0];
