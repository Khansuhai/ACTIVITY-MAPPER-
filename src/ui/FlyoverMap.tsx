import { Map as MapLibreMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../app/player';
import type { Basemap } from '../basemaps/registry';
import type { TerrainSource } from '../basemaps/terrain';
import type { Track } from '../import';
import '../render/maplibre';
import { dotSpacing } from '../render/dots';
import { addScene, applyCamera, RouteLayers, setExaggeration } from '../render/scene';
import type { Viewport } from '../camera/camera';
import type { Timeline } from '../timeline/timeline';

interface FlyoverMapProps {
  track: Track | null;
  timeline: Timeline | null;
  basemap: Basemap;
  terrain: TerrainSource;
  onViewportChange(viewport: Viewport): void;
}

/**
 * The 3D map. It is driven imperatively from the timeline: every change of player time calls
 * `applyFrame(timeline.at(time))`, without re-rendering React.
 */
export function FlyoverMap({
  track,
  timeline,
  basemap,
  terrain,
  onViewportChange,
}: FlyoverMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Latest props for MapLibre event handlers, which outlive a single render.
  const latest = useRef({ track, timeline, basemap, terrain });
  const styleReadyRef = useRef(false);
  const routeRef = useRef<RouteLayers | null>(null);
  const basemapIdRef = useRef(basemap.id);
  const playing = usePlayer((s) => s.playing);
  // MapLibre v6 requires WebGL2; check once instead of letting the map fail.
  const [hasWebGL2] = useState(supportsWebGL2);

  useEffect(() => {
    latest.current = { track, timeline, basemap, terrain };
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasWebGL2) return;

    const map = new MapLibreMap({
      container,
      style: latest.current.basemap.style,
      center: [10, 30],
      zoom: 1.5,
      maxPitch: 85,
      attributionControl: { compact: true },
    });
    map.on('error', (e) => {
      // Terrain sources 404 above their coverage on purpose; MapLibre then uses parent tiles.
      if (isMissingTile(e.error)) return;
      console.warn('Map error:', e.error);
    });
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    // A style switch replaces everything, so rebuild the scene whenever a style finishes loading.
    map.on('style.load', () => {
      const { track, timeline, basemap, terrain } = latest.current;
      addScene(map, basemap, terrain, usePlayer.getState().exaggeration);
      routeRef.current = new RouteLayers(map);
      styleReadyRef.current = true;
      showRoute(map, routeRef.current, track, timeline);
    });
    mapRef.current = map;
    // Debug handle for the browser console during development; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = map;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) onViewportChange({ width, height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      routeRef.current = null;
      styleReadyRef.current = false;
    };
  }, [hasWebGL2, onViewportChange]);

  // New track or new timeline: redraw the route and jump to the current frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeRef.current || !styleReadyRef.current) return;
    showRoute(map, routeRef.current, track, timeline);
  }, [track, timeline]);

  // Follow player time.
  useEffect(() => {
    if (!timeline) return;
    return usePlayer.subscribe((state, prev) => {
      const map = mapRef.current;
      if (state.time === prev.time || !map || !styleReadyRef.current) return;
      const frame = timeline.at(state.time);
      applyCamera(map, frame);
      routeRef.current?.update(frame.distance);
    });
  }, [timeline]);

  // Terrain exaggeration.
  useEffect(
    () =>
      usePlayer.subscribe((state, prev) => {
        const map = mapRef.current;
        if (state.exaggeration !== prev.exaggeration && map && styleReadyRef.current) {
          setExaggeration(map, state.exaggeration);
        }
      }),
    [],
  );

  // Switch basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || basemapIdRef.current === basemap.id) return;
    basemapIdRef.current = basemap.id;
    styleReadyRef.current = false;
    map.setStyle(basemap.style);
  }, [basemap]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Flyover map" role="region" />
      {/* While playing, the timeline owns the camera: block mouse and touch input on the map. */}
      {playing && <div className="absolute inset-0" aria-hidden="true" />}
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

function showRoute(
  map: MapLibreMap,
  route: RouteLayers,
  track: Track | null,
  timeline: Timeline | null,
) {
  if (!track || !timeline) {
    route.set(null, 1);
    return;
  }
  const frame = timeline.at(usePlayer.getState().time);
  route.set(track, dotSpacing(timeline.length, timeline.chaseZoom, frame.position.lat));
  applyCamera(map, frame);
  route.update(frame.distance);
}

function supportsWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

function isMissingTile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 404
  );
}
