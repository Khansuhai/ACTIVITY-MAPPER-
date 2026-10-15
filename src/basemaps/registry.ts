/**
 * Every map style the app can use, with the attribution and license notes we must honour.
 * The attribution string is also burned into exported videos (Phase 4), so keep it exact.
 */
export interface Basemap {
  id: string;
  name: string;
  /** MapLibre style JSON URL. */
  styleUrl: string;
  /** Attribution text required by the provider. */
  attribution: string;
  /** Short license / terms summary, with where it was checked. */
  license: string;
  /** True if the provider needs an API key (read from VITE_* env vars, never committed). */
  needsKey: boolean;
}

const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
const OPENFREEMAP_LICENSE =
  'OpenFreeMap: free, no key, commercial use allowed, attribution required (openfreemap.org, checked 2026-10). ' +
  'Map data © OpenStreetMap contributors, ODbL.';

export const BASEMAPS = [
  {
    id: 'ofm-liberty',
    name: 'Outdoor',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
  },
  {
    id: 'ofm-positron',
    name: 'Minimal',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
  },
  {
    id: 'ofm-dark',
    name: 'Dark',
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    attribution: OPENFREEMAP_ATTRIBUTION,
    license: OPENFREEMAP_LICENSE,
    needsKey: false,
  },
] as const satisfies readonly Basemap[];

export type BasemapId = (typeof BASEMAPS)[number]['id'];

export const DEFAULT_BASEMAP: Basemap = BASEMAPS[0];

export function getBasemap(id: string): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? DEFAULT_BASEMAP;
}
