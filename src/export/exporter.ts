import { Map as MapLibreMap } from 'maplibre-gl';
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type VideoCodec,
} from 'mediabunny';
import { renderSoundtrack } from '../audio/mix';
import type { Basemap } from '../basemaps/registry';
import type { ElevationFn } from '../camera/clearance';
import type { CameraStyle } from '../camera/styles';
import type { TerrainSource } from '../basemaps/terrain';
import type { Track } from '../import';
import { PhotoCache } from '../photos/cache';
import { composeFrame, photoDecodeSize } from '../render/compose';
import { dotSpacing } from '../render/dots';
import '../render/maplibre';
import type { OverlayModel } from '../render/overlays';
import {
  addScene,
  applyCamera,
  type MapLabels,
  type PhotoPin,
  RouteLayers,
  type RouteLook,
} from '../render/scene';
import type { PhotoStop } from '../timeline/timeline';
import {
  type Aspect,
  avcCodecString,
  chooseBitrate,
  exportViewport,
  type Fps,
  type Resolution,
  videoSize,
} from './plan';
import { loadElevation } from '../terrain/dem';
import { bbox } from '../track/geo';
import { exportSupportProblem, exportTimeline } from './timing';

export interface ExportOptions {
  track: Track;
  basemap: Basemap;
  terrain: TerrainSource;
  exaggeration: number;
  aspect: Aspect;
  resolution: Resolution;
  fps: Fps;
  /** Target length in seconds (see planDurations). */
  length: number;
  stops: readonly PhotoStop[];
  photoSeconds: number | null;
  cameraStyle: CameraStyle;
  /** Distances (m, along the shown route) the cinematic camera swings around. */
  highlights: readonly number[];
  photoBlobs: ReadonlyMap<string, Blob>;
  pins: readonly PhotoPin[];
  look: RouteLook;
  labels: MapLabels;
  model: OverlayModel;
  /** Music to mix in (looped, faded), or null for a silent video. */
  music: AudioBuffer | null;
  musicVolume: number;
  /** Terrain heights for the ridge-aware camera; loaded here if not ready yet. */
  elevation: ElevationFn | null;
  /** Stream into this file (File System Access API), or null to build the video in memory. */
  file: FileSystemFileHandle | null;
}

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  /** Seconds since the export started. */
  elapsed: number;
}

export class ExportUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportUnsupportedError';
  }
}

/**
 * Renders the flyover frame by frame and encodes it to MP4. Each frame waits until the map has
 * fully loaded and settled, so the result is smooth however slow the computer is (DECISIONS.md,
 * D26). Returns the video as a Blob when built in memory, or null when streamed to a file.
 */
export async function exportVideo(
  options: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob | null> {
  const problem = exportSupportProblem();
  if (problem) throw new ExportUnsupportedError(problem);

  const { width, height } = videoSize(options.aspect, options.resolution);
  const { css, pixelRatio } = exportViewport(width, height);
  // The same terrain heights as the preview, so the camera tilts exactly as previewed.
  const elevation =
    options.elevation ??
    (await loadElevation(bbox(options.track.points), options.terrain, signal).catch(() => null));
  const timeline = exportTimeline(options.track, css, {
    length: options.length,
    stops: options.stops,
    photoSeconds: options.photoSeconds,
    cameraStyle: options.cameraStyle,
    highlights: options.highlights,
    terrain: elevation ? { elevationAt: elevation, exaggeration: options.exaggeration } : undefined,
  });
  const fps = options.fps;
  const totalFrames = Math.round(timeline.duration * fps);
  const bitrate = chooseBitrate(width, height, fps);
  const codec = await pickCodec(width, height, fps, bitrate);

  const container = document.createElement('div');
  // Laid out at the export's CSS size, far off screen. WebGL still renders while the tab is visible.
  Object.assign(container.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${css.width}px`,
    height: `${css.height}px`,
    pointerEvents: 'none',
  });
  document.body.appendChild(container);

  const cache = new PhotoCache((id) => options.photoBlobs.get(id) ?? null, 2);
  let map: MapLibreMap | null = null;
  let output: Output | null = null;
  let writable: FileSystemWritableFileStream | null = null;

  try {
    map = new MapLibreMap({
      container,
      style: options.basemap.style,
      pixelRatio,
      interactive: false,
      attributionControl: false,
      // No fades: every frame shows only fully loaded, fully opaque content.
      fadeDuration: 0,
      maxPitch: 85,
      // Styles come from our fixed, trusted registry: skip re-validating their large JSON on the
      // main thread (a big part of start-up blocking time, per Lighthouse).
      validateStyle: false,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      center: timeline.at(0).camera.center,
      zoom: timeline.at(0).camera.zoom,
    });
    await new Promise<void>((resolve, reject) => {
      map!.once('style.load', () => resolve());
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    addScene(map, options.basemap, options.terrain, options.exaggeration);
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'raster') map.setPaintProperty(layer.id, 'raster-fade-duration', 0);
    }
    const route = new RouteLayers(map);
    route.set(
      options.track,
      dotSpacing(timeline.length, timeline.chaseZoom, timeline.at(0).position.lat),
      options.look,
      pixelRatio,
    );
    route.setPhotos(options.pins, pixelRatio);
    route.setLabels(options.labels, pixelRatio);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let target: BufferTarget | StreamTarget;
    if (options.file) {
      writable = await options.file.createWritable();
      target = new StreamTarget(writable, { chunked: true });
    } else {
      target = new BufferTarget();
    }
    output = new Output({
      // In memory, put the index first so phones can start playing before the whole file loads.
      format: new Mp4OutputFormat({ fastStart: options.file ? false : 'in-memory' }),
      target,
    });
    const source = new CanvasSource(canvas, {
      codec: codec.codec,
      bitrate,
      bitrateMode: 'variable',
      keyFrameInterval: 2,
      latencyMode: 'quality',
      ...(codec.fullCodecString ? { fullCodecString: codec.fullCodecString } : {}),
    });
    output.addVideoTrack(source, { frameRate: fps });

    // Soundtrack: AAC plays everywhere; Opus where AAC can't be encoded (Firefox).
    let audio: AudioBufferSource | null = null;
    let soundtrack: AudioBuffer | null = null;
    if (options.music) {
      const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
        numberOfChannels: 2,
        sampleRate: 48_000,
        bitrate: 192_000,
      });
      if (audioCodec) {
        soundtrack = await renderSoundtrack(options.music, timeline.duration, options.musicVolume);
        audio = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
        output.addAudioTrack(audio);
      } else {
        console.warn('No audio encoder available: exporting without music.');
      }
    }
    await output.start();
    if (audio && soundtrack) {
      await audio.add(soundtrack);
      audio.close();
    }

    const started = performance.now();
    const photoSize = photoDecodeSize(width, height);
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) throw signal.reason;
      const frame = timeline.at(i / fps);
      applyCamera(map, frame);
      route.update(frame.distance);
      await renderSettled(map, signal);

      ctx.drawImage(map.getCanvas(), 0, 0, width, height);
      const photo = frame.photo ? await cache.load(frame.photo.id, photoSize) : null;
      composeFrame(ctx, width, height, frame, timeline, options.model, photo);
      // Start decoding the next photo early.
      const next = timeline.at((i + fps * 2) / fps).photo;
      if (next) void cache.load(next.id, photoSize)?.catch(() => undefined);

      await source.add(i / fps, 1 / fps);
      onProgress({ frame: i + 1, totalFrames, elapsed: (performance.now() - started) / 1000 });
    }

    await output.finalize();
    if (target instanceof BufferTarget) {
      return new Blob([target.buffer!], { type: 'video/mp4' });
    }
    return null;
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => undefined);
    }
    await writable?.abort().catch(() => undefined);
    throw error;
  } finally {
    cache.clear();
    map?.remove();
    container.remove();
  }
}

/**
 * Waits until MapLibre has rendered the current camera with every tile loaded and nothing left
 * to animate. If tiles never arrive (offline), gives up after a while and uses what is there.
 */
function renderSettled(map: MapLibreMap, signal: AbortSignal, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      clearTimeout(timer);
      map.off('idle', done);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      map.off('idle', done);
      console.warn('Map did not finish loading for this frame; using what is rendered.');
      done();
    }, timeoutMs);
    signal.addEventListener('abort', aborted, { once: true });
    map.once('idle', done);
    map.triggerRepaint();
  });
}

/** H.264 if possible (plays everywhere), with the right level; otherwise the first codec that works. */
async function pickCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<{ codec: VideoCodec; fullCodecString?: string }> {
  const fullCodecString = avcCodecString(width, height, fps, bitrate);
  const support = await VideoEncoder.isConfigSupported({
    codec: fullCodecString,
    width,
    height,
    bitrate,
    framerate: fps,
  }).catch(() => null);
  if (support?.supported) return { codec: 'avc', fullCodecString };

  const fallback = await getFirstEncodableVideoCodec(['hevc', 'vp9', 'av1'], {
    width,
    height,
    bitrate,
  });
  if (!fallback) {
    throw new ExportUnsupportedError(
      `This browser cannot encode ${width}×${height} video. Try a lower resolution, or Chrome/Edge.`,
    );
  }
  return { codec: fallback };
}
