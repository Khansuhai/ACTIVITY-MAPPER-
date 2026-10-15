/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in metres (haversine). Accurate to ~0.5 % for any GPS use. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** [west, south, east, north], the order MapLibre's fitBounds accepts. */
export type BBox = [number, number, number, number];

export function bbox(points: readonly LatLon[]): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const { lat, lon } of points) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}
