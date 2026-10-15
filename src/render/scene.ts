import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Basemap } from '../basemaps/registry';
import type { TerrainSource } from '../basemaps/terrain';
import type { Track } from '../import';
import type { Frame } from '../timeline/timeline';
import { createSampler } from '../track/sampler';
import { dotIndex, routeDots } from './dots';

const DEM_TERRAIN = 'dem-terrain';
const DEM_HILLSHADE = 'dem-hillshade';
const ROUTE = 'route';
const DOTS = 'route-dots';
const PINS = 'photo-pins';

/** A photo pin on the map. */
export interface PhotoPin {
  id: string;
  lon: number;
  lat: number;
  thumb: ImageBitmap;
}

export const ROUTE_COLOR = '#f97316';

/**
 * Adds terrain, hillshade and sky to a freshly loaded style. Called on every `style.load`,
 * because switching basemap replaces the whole style.
 */
export function addScene(
  map: MapLibreMap,
  basemap: Basemap,
  terrain: TerrainSource,
  exaggeration: number,
) {
  // Separate DEM sources for terrain and hillshade, as MapLibre recommends: they are prepared
  // differently and sharing one causes tile-loading artefacts.
  map.addSource(DEM_TERRAIN, terrain.source);
  map.addSource(DEM_HILLSHADE, terrain.source);
  if (basemap.hillshade) {
    map.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: DEM_HILLSHADE,
        paint: {
          'hillshade-exaggeration': 0.35,
          'hillshade-shadow-color': 'rgba(40, 40, 60, 0.6)',
          'hillshade-highlight-color': 'rgba(255, 255, 255, 0.25)',
        },
      },
      firstLabelLayer(map),
    );
  }
  map.setTerrain({ source: DEM_TERRAIN, exaggeration });
  map.setSky(basemap.sky);
}

export function setExaggeration(map: MapLibreMap, exaggeration: number) {
  if (map.getSource(DEM_TERRAIN)) map.setTerrain({ source: DEM_TERRAIN, exaggeration });
}

/**
 * The route on the map, and which of its dots are lit. Nothing about the route's sources or
 * styles changes during playback: only feature-state, which is cheap with 3D terrain.
 */
export class RouteLayers {
  private count = 0;
  private spacing = 1;
  /** Highest lit dot index, -1 for none. */
  private lit = -1;
  private marker = -1;
  private track: Track | null = null;
  private pinImages: string[] = [];

  private readonly map: MapLibreMap;

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  /** Adds or replaces the route. `spacing` is the dot spacing in metres (see dotSpacing). */
  set(track: Track | null, spacing: number) {
    // Rebuilding the route clears the lit dots and flickers, so skip it when nothing changed.
    if (
      track === this.track &&
      spacing === this.spacing &&
      hasSource(this.map, ROUTE) === !!track
    ) {
      return;
    }
    this.track = track;
    const map = this.map;
    for (const id of ['route-marker', 'route-dots', 'route-line', 'route-casing']) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of [DOTS, ROUTE]) if (map.getSource(id)) map.removeSource(id);
    this.count = 0;
    this.lit = -1;
    this.marker = -1;
    if (!track) return;

    const line: Feature<LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: track.points.map((p) => [p.lon, p.lat]) },
    };
    const dots = routeDots(createSampler(track.points), spacing);
    const dotFeatures: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: dots.map((coordinates, id) => ({
        type: 'Feature',
        id,
        properties: {},
        geometry: { type: 'Point', coordinates },
      })),
    };
    this.count = dots.length;
    this.spacing = spacing;

    map.addSource(ROUTE, { type: 'geojson', data: line });
    map.addSource(DOTS, { type: 'geojson', data: dotFeatures });
    // The full route, faded. It never changes, so terrain keeps it in its texture cache.
    map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: ROUTE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.5 },
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: ROUTE,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ROUTE_COLOR, 'line-width': 3, 'line-opacity': 0.4 },
    });
    // The travelled part: dots switched on with feature-state.
    map.addLayer({
      id: 'route-dots',
      type: 'circle',
      source: DOTS,
      paint: {
        'circle-radius': 2.5,
        'circle-color': ROUTE_COLOR,
        'circle-pitch-alignment': 'map',
        'circle-opacity': ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0],
      },
    });
    // The marker is the dot under the current position, drawn big on its own layer.
    const isMarker: ExpressionSpecification = [
      'case',
      ['boolean', ['feature-state', 'marker'], false],
      1,
      0,
    ];
    map.addLayer({
      id: 'route-marker',
      type: 'circle',
      source: DOTS,
      paint: {
        'circle-radius': 8,
        'circle-color': ROUTE_COLOR,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
        'circle-opacity': isMarker,
        'circle-stroke-opacity': isMarker,
      },
    });
  }

  /**
   * Shows a round thumbnail pin where the flyover stops for each photo. Static between edits,
   * so it costs nothing per frame.
   */
  setPhotos(pins: readonly PhotoPin[], pixelRatio = globalThis.devicePixelRatio || 1) {
    const map = this.map;
    if (map.getLayer(PINS)) map.removeLayer(PINS);
    if (map.getSource(PINS)) map.removeSource(PINS);
    for (const id of this.pinImages) if (map.hasImage(id)) map.removeImage(id);
    this.pinImages = [];
    if (pins.length === 0) return;

    const ratio = Math.min(4, Math.max(1, pixelRatio));
    for (const pin of pins) {
      const imageId = `photo-pin-${pin.id}`;
      map.addImage(imageId, pinImage(pin.thumb, ratio), { pixelRatio: ratio });
      this.pinImages.push(imageId);
    }
    map.addSource(PINS, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: pins.map((p) => ({
          type: 'Feature',
          properties: { icon: `photo-pin-${p.id}` },
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        })),
      },
    });
    map.addLayer(
      {
        id: PINS,
        type: 'symbol',
        source: PINS,
        layout: {
          'icon-image': ['get', 'icon'],
          // Pins are screen-sized icons: keep them modest so they don't hide the route ahead.
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.45, 14, 0.7],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      map.getLayer('route-marker') ? 'route-marker' : undefined,
    );
  }

  /** Lights dots up to the frame's position and moves the marker. Cost scales with the change. */
  update(distance: number) {
    if (this.count === 0) return;
    const k = dotIndex(distance, this.spacing, this.count);
    const map = this.map;
    for (let i = this.lit + 1; i <= k; i++)
      map.setFeatureState({ source: DOTS, id: i }, { lit: true });
    for (let i = this.lit; i > k; i--) map.setFeatureState({ source: DOTS, id: i }, { lit: false });
    this.lit = k;
    if (k !== this.marker) {
      if (this.marker >= 0)
        map.setFeatureState({ source: DOTS, id: this.marker }, { marker: false });
      map.setFeatureState({ source: DOTS, id: k }, { marker: true });
      this.marker = k;
    }
  }
}

function hasSource(map: MapLibreMap, source: string): boolean {
  return map.getSource(source) !== undefined;
}

/** PIN_SIZE CSS px circle with a white ring and a small pointer, filled with the thumbnail. */
const PIN_SIZE = 40;

function pinImage(thumb: ImageBitmap, ratio: number): ImageData {
  const d = PIN_SIZE * ratio;
  const ring = 3 * ratio;
  const tip = 7 * ratio;
  const canvas = new OffscreenCanvas(Math.ceil(d), Math.ceil(d + tip));
  const ctx = canvas.getContext('2d')!;
  const r = d / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(r - tip, d - tip / 2);
  ctx.lineTo(r, d + tip);
  ctx.lineTo(r + tip, d - tip / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  // Thumbnail, cover-fitted into the inner circle.
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - ring, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max(d / thumb.width, d / thumb.height);
  ctx.drawImage(
    thumb,
    r - (thumb.width * s) / 2,
    r - (thumb.height * s) / 2,
    thumb.width * s,
    thumb.height * s,
  );
  ctx.restore();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Puts the camera where one timeline frame says. */
export function applyCamera(map: MapLibreMap, { camera }: Frame) {
  const height = map.getContainer().clientHeight;
  map.jumpTo({
    center: camera.center,
    zoom: camera.zoom,
    pitch: camera.pitch,
    bearing: camera.bearing,
    // Top padding moves the focus point down the screen by half the padding.
    padding: { top: 2 * camera.offsetY * height, bottom: 0, left: 0, right: 0 },
  });
}

/** Hillshade goes under roads and labels, so it shades the land without dimming text. */
function firstLabelLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol' || l.type === 'line')?.id;
}
