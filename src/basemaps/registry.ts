import type { SkySpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Every map style the app can use, with the attribution and license notes we must honour.
 * The attribution string is also burned into exported videos (Phase 4), so keep it exact.
 */
export interface Basemap {
  id: string;
  name: string;
  /** MapLibre style: a style JSON URL, or an inline style for raster imagery. */
  style: string | StyleSpecification;
  /** Attribution text required by the provider. */
  attribution: string;
  /** Short license / terms summary, with where it was checked. */
  license: string;
  /** True if the provider needs an API key (read from VITE_* env vars, never committed). */
  needsKey: boolean;
  /** Draw hillshade over this basemap (not needed for photos of the ground). */
  hillshade: boolean;
  sky: SkySpecification;
}

const LIGHT_SKY: SkySpecification = {
  'sky-color': '#7fb8f0',
  'horizon-color': '#e8f2fb',
  'fog-color': '#f2f6f9',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.75,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
};

const DARK_SKY: SkySpecification = {
  'sky-color': '#0b1220',
  'horizon-color': '#1e293b',
  'fog-color': '#0f172a',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.75,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
};

const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
const OPENFREEMAP_LICENSE =
  'OpenFreeMap: free, no key, commercial use allowed, attribution required (openfreemap.org, checked 2026-10). ' +
  'Map data © OpenStreetMap contributors, ODbL.';

const EOX_ATTRIBUTION =
  'Sentinel-2 cloudless 2016 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)';

export const BASEMAPS = [
  {
    id: 'ofm-liberty',
    name: 'Outdoor',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
    hillshade: true,
    sky: LIGHT_SKY,
  },
  {
    id: 'eox-s2-2016',
    name: 'Satellite',
    style: {
      version: 8,
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
          ],
          tileSize: 256,
          maxzoom: 15,
          attribution: `<a href="https://s2maps.eu" target="_blank" rel="noopener">${EOX_ATTRIBUTION}</a>`,
        },
      },
      layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
    },
    attribution: EOX_ATTRIBUTION,
    license:
      'EOX Sentinel-2 cloudless 2016 edition: CC BY 4.0, commercial use allowed with attribution ' +
      '(WMTS capabilities, checked 2026-10). Later editions (2017+) are CC BY-NC-SA and are NOT used.',
    needsKey: false,
    hillshade: false,
    sky: LIGHT_SKY,
  },
  {
    id: 'ofm-positron',
    name: 'Minimal',
    style: 'https://tiles.openfreemap.org/styles/positron',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
    hillshade: true,
    sky: LIGHT_SKY,
  },
  {
    id: 'ofm-dark',
    name: 'Dark',
    style: 'https://tiles.openfreemap.org/styles/dark',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
    hillshade: true,
    sky: DARK_SKY,
  },
] as const satisfies readonly Basemap[];

export type BasemapId = (typeof BASEMAPS)[number]['id'];

export const DEFAULT_BASEMAP: Basemap = BASEMAPS[0];

export function getBasemap(id: string): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? DEFAULT_BASEMAP;
}
