import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Basemap } from '../basemaps/registry';
import type { TerrainSource } from '../basemaps/terrain';
import type { Track } from '../import';
import type { Frame } from '../timeline/timeline';
import { createSampler } from '../track/sampler';
import type { RouteColoring } from '../track/colorize';
import { dotIndex, routeDots } from './dots';
import { type MarkerChoice, markerImage } from './icons';

const DEM_TERRAIN = 'dem-terrain';
const DEM_HILLSHADE = 'dem-hillshade';
const ROUTE = 'route';
const DOTS = 'route-dots';
const PINS = 'photo-pins';
const MARKER_IMAGE = 'route-marker-icon';

const LABELS_SOURCE = 'ofm-labels';
const PEAKS = 'peak-labels';
const HIGHLIGHTS = 'highlights';

/** Map labels: summits and passes from the map data, and the activity's highlights. */
export interface MapLabels {
  peaks: boolean;
  /** White text with a dark halo (for satellite and dark maps). */
  lightText: boolean;
  highlights: { lat: number; lon: number; label: string; kind: 'highest' | 'fastest-km' }[];
  color: string;
}

/** How the route looks: theme colour, value colouring, and the marker. */
export interface RouteLook {
  color: string;
  coloring: RouteColoring;
  marker: MarkerChoice;
}

/** A photo pin on the map. */
export interface PhotoPin {
  id: string;
  lon: number;
  lat: number;
  thumb: ImageBitmap;
}

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
  private look: RouteLook | null = null;
  private pinImages: string[] = [];
  private labels: MapLabels | null = null;

  private readonly map: MapLibreMap;

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  /**
   * Adds or replaces the route. `spacing` is the dot spacing in metres (see dotSpacing); `look`
   * sets colours and the marker. Colours are baked into the layers once, never per frame.
   */
  set(
    track: Track | null,
    spacing: number,
    look: RouteLook,
    pixelRatio = globalThis.devicePixelRatio || 1,
  ) {
    // Rebuilding the route clears the lit dots and flickers, so skip it when nothing changed.
    if (
      track === this.track &&
      spacing === this.spacing &&
      look === this.look &&
      hasSource(this.map, ROUTE) === !!track
    ) {
      return;
    }
    this.track = track;
    this.look = look;
    const map = this.map;
    for (const id of ['route-marker', 'route-dots', 'route-line', 'route-casing']) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of [DOTS, ROUTE]) if (map.getSource(id)) map.removeSource(id);
    if (map.hasImage(MARKER_IMAGE)) map.removeImage(MARKER_IMAGE);
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
        // Colour of the route here (speed, heart rate, ... or the theme colour).
        properties: { c: look.coloring.colorAt(id * spacing) },
        geometry: { type: 'Point', coordinates },
      })),
    };
    this.count = dots.length;
    this.spacing = spacing;

    const stops = look.coloring.gradientStops;
    const graded = stops.length > 1;
    map.addSource(ROUTE, { type: 'geojson', data: line, lineMetrics: graded });
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
      paint: graded
        ? {
            'line-width': 3,
            'line-opacity': 0.45,
            'line-gradient': [
              'interpolate',
              ['linear'],
              ['line-progress'],
              ...stops.flat(),
            ] as ExpressionSpecification,
          }
        : { 'line-color': look.color, 'line-width': 3, 'line-opacity': 0.4 },
    });
    // The travelled part: dots switched on with feature-state.
    map.addLayer({
      id: 'route-dots',
      type: 'circle',
      source: DOTS,
      paint: {
        'circle-radius': 2.5,
        'circle-color': ['get', 'c'],
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
    if (look.marker.kind === 'dot') {
      map.addLayer({
        id: 'route-marker',
        type: 'circle',
        source: DOTS,
        paint: {
          'circle-radius': 8,
          'circle-color': look.color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-opacity': isMarker,
          'circle-stroke-opacity': isMarker,
        },
      });
    } else {
      const ratio = Math.min(4, Math.max(1, pixelRatio));
      map.addImage(MARKER_IMAGE, markerImage(look.marker, look.color, ratio), {
        pixelRatio: ratio,
      });
      map.addLayer({
        id: 'route-marker',
        type: 'symbol',
        source: DOTS,
        layout: {
          'icon-image': MARKER_IMAGE,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-pitch-alignment': 'viewport',
        },
        paint: { 'icon-opacity': isMarker },
      });
    }
    if (map.getLayer(PINS)) map.moveLayer(PINS, 'route-marker');
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

  /**
   * Summit and pass names (OpenStreetMap, via the OpenFreeMap vector tiles) and the activity's
   * highlights. Static symbol layers: no per-frame cost.
   */
  setLabels(labels: MapLabels, pixelRatio = globalThis.devicePixelRatio || 1) {
    if (labels === this.labels && this.map.getLayer(HIGHLIGHTS)) return;
    this.labels = labels;
    const map = this.map;
    for (const id of [PEAKS, HIGHLIGHTS]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(HIGHLIGHTS)) map.removeSource(HIGHLIGHTS);
    const ratio = Math.min(4, Math.max(1, pixelRatio));
    const icons: [string, (c: Ctx2D, d: number) => void][] = [
      ['label-peak', drawPeakIcon],
      ['label-pass', drawPassIcon],
      ['label-highest', (c, d) => drawStar(c, d, labels.color)],
      ['label-fastest', (c, d) => drawBolt(c, d, labels.color)],
    ];
    for (const [id, draw] of icons) {
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, iconImage(draw, ratio), { pixelRatio: ratio });
    }
    const text = labels.lightText
      ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(15, 23, 42, 0.85)' }
      : { 'text-color': '#1f2937', 'text-halo-color': 'rgba(255, 255, 255, 0.9)' };
    const before = map.getLayer(PINS)
      ? PINS
      : map.getLayer('route-marker')
        ? 'route-marker'
        : undefined;

    if (labels.peaks) {
      // OpenFreeMap styles already have the vector source; the satellite style needs it added.
      const source = map.getSource('openmaptiles') ? 'openmaptiles' : LABELS_SOURCE;
      if (source === LABELS_SOURCE && !map.getSource(LABELS_SOURCE)) {
        map.addSource(LABELS_SOURCE, {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet',
          attribution:
            '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © OpenMapTiles Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
        });
      }
      map.addLayer(
        {
          id: PEAKS,
          type: 'symbol',
          source,
          'source-layer': 'mountain_peak',
          minzoom: 9,
          filter: [
            'all',
            ['has', 'name'],
            ['match', ['get', 'class'], ['peak', 'volcano', 'saddle'], true, false],
          ],
          layout: {
            'icon-image': ['match', ['get', 'class'], 'saddle', 'label-pass', 'label-peak'],
            'icon-anchor': 'bottom',
            'text-field': [
              'format',
              ['get', 'name'],
              { 'font-scale': 1 },
              [
                'case',
                ['has', 'ele'],
                ['concat', '\n', ['to-string', ['round', ['get', 'ele']]], ' m'],
                '',
              ],
              { 'font-scale': 0.8 },
            ],
            'text-font': ['Noto Sans Bold'],
            'text-size': 13,
            'text-anchor': 'top',
            'text-offset': [0, 0.3],
            'symbol-sort-key': ['get', 'rank'],
          },
          paint: { ...text, 'text-halo-width': 1.6 },
        },
        before,
      );
    }

    map.addSource(HIGHLIGHTS, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: labels.highlights.map((h) => ({
          type: 'Feature',
          properties: {
            label: h.label,
            icon: h.kind === 'highest' ? 'label-highest' : 'label-fastest',
          },
          geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
        })),
      },
    });
    map.addLayer(
      {
        id: HIGHLIGHTS,
        type: 'symbol',
        source: HIGHLIGHTS,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-allow-overlap': true,
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-anchor': 'left',
          'text-offset': [1.1, 0],
          'text-allow-overlap': true,
        },
        paint: { ...text, 'text-halo-width': 1.8 },
      },
      before,
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

type Ctx2D = OffscreenCanvasRenderingContext2D;

/** Small label icons, drawn here (not copied from an icon set). */
function iconImage(draw: (ctx: Ctx2D, d: number) => void, ratio: number): ImageData {
  const d = Math.round(18 * ratio);
  const canvas = new OffscreenCanvas(d, d);
  const ctx = canvas.getContext('2d')!;
  draw(ctx, d);
  return ctx.getImageData(0, 0, d, d);
}

function drawPeakIcon(ctx: Ctx2D, d: number) {
  ctx.fillStyle = '#7c2d12';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = d / 9;
  ctx.beginPath();
  ctx.moveTo(d / 2, d * 0.18);
  ctx.lineTo(d * 0.85, d * 0.82);
  ctx.lineTo(d * 0.15, d * 0.82);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

/** A saddle: a curve dipping between two rises. */
function drawPassIcon(ctx: Ctx2D, d: number) {
  ctx.lineCap = 'round';
  for (const [color, width] of [
    ['#ffffff', d / 4],
    ['#7c2d12', d / 9],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(d * 0.15, d * 0.3);
    ctx.quadraticCurveTo(d / 2, d * 0.95, d * 0.85, d * 0.3);
    ctx.stroke();
  }
}

function drawStar(ctx: Ctx2D, d: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = d / 10;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? d * 0.45 : d * 0.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(d / 2 + r * Math.cos(a), d / 2 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

function drawBolt(ctx: Ctx2D, d: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = d / 10;
  ctx.beginPath();
  const pts: [number, number][] = [
    [0.58, 0.06],
    [0.2, 0.55],
    [0.46, 0.55],
    [0.38, 0.94],
    [0.8, 0.42],
    [0.53, 0.42],
  ];
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * d, y * d) : ctx.moveTo(x * d, y * d)));
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
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
