import {
  type GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { useEffect, useRef, useState } from 'react';
import type { Basemap } from '../basemaps/registry';
import '../render/maplibre';
import type { Track } from '../import';
import { bbox } from '../track/geo';

const ROUTE_SOURCE = 'route';
const ENDPOINTS_SOURCE = 'route-endpoints';
const ROUTE_COLOR = '#f97316';

interface RouteMapProps {
  track: Track | null;
  basemap: Basemap;
}

/** 2D map with the route, start and finish points. Phase 2 turns this into the 3D player. */
export function RouteMap({ track, basemap }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const trackRef = useRef(track);
  const styleUrlRef = useRef(basemap.styleUrl);
  // Our own flag: map.isStyleLoaded() stays false while tiles load, long after 'style.load'.
  const styleReadyRef = useRef(false);
  // MapLibre v6 requires WebGL2; check once instead of letting the map fail.
  const [hasWebGL2] = useState(supportsWebGL2);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasWebGL2) return;

    const map = new MapLibreMap({
      container,
      style: styleUrlRef.current,
      center: [10, 30],
      zoom: 1.5,
      attributionControl: { compact: true },
    });
    // Tile and style load errors arrive here; log them rather than failing silently.
    map.on('error', (e) => console.warn('Map error:', e.error));
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    // A style switch drops our layers, so redraw the route whenever a style finishes loading.
    map.on('style.load', () => {
      styleReadyRef.current = true;
      drawRoute(map, trackRef.current);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, [hasWebGL2]);

  // Draw and frame a newly imported track.
  useEffect(() => {
    trackRef.current = track;
    const map = mapRef.current;
    if (!map) return;
    // If the style is still loading, the 'style.load' handler draws trackRef.current.
    if (styleReadyRef.current) drawRoute(map, track);
    if (track) {
      map.fitBounds(bbox(track.points), { padding: 60, duration: 1200, maxZoom: 16 });
    }
  }, [track]);

  // Switch basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleUrlRef.current === basemap.styleUrl) return;
    styleUrlRef.current = basemap.styleUrl;
    styleReadyRef.current = false;
    map.setStyle(basemap.styleUrl);
  }, [basemap]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Route map" role="region" />
      {!hasWebGL2 && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-8 text-center">
          <p className="max-w-md text-slate-300">
            The map needs WebGL2, which this browser has turned off or does not support. Current
            Chrome, Edge, Firefox and Safari all support it; check that hardware acceleration is on.
          </p>
        </div>
      )}
    </div>
  );
}

function supportsWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

function drawRoute(map: MapLibreMap, track: Track | null) {
  const coordinates = track?.points.map((p) => [p.lon, p.lat]) ?? [];
  const first = coordinates[0];
  const last = coordinates.at(-1);

  const line: Feature<LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
  const endpoints: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features:
      first && last
        ? [
            {
              type: 'Feature',
              properties: { kind: 'finish' },
              geometry: { type: 'Point', coordinates: last },
            },
            {
              type: 'Feature',
              properties: { kind: 'start' },
              geometry: { type: 'Point', coordinates: first },
            },
          ]
        : [],
  };

  const routeSource = map.getSource<GeoJSONSource>(ROUTE_SOURCE);
  const endpointsSource = map.getSource<GeoJSONSource>(ENDPOINTS_SOURCE);
  if (routeSource && endpointsSource) {
    routeSource.setData(line);
    endpointsSource.setData(endpoints);
    return;
  }

  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: line });
  map.addSource(ENDPOINTS_SOURCE, { type: 'geojson', data: endpoints });
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: ROUTE_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ROUTE_COLOR, 'line-width': 4 },
  });
  map.addLayer({
    id: 'route-endpoints',
    type: 'circle',
    source: ENDPOINTS_SOURCE,
    paint: {
      'circle-radius': 7,
      'circle-color': ['match', ['get', 'kind'], 'start', '#22c55e', '#ef4444'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  });
}
