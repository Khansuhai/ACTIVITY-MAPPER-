import {
  type CameraState,
  easeInOutCubic,
  fitBounds,
  interpolateCamera,
  type Viewport,
  zoomForGroundSpeed,
} from '../camera/camera';
import { createSmoothCamera, defaultSmoothOptions, type SmoothOptions } from '../camera/smooth';
import type { TrackPoint } from '../import/types';
import { bbox } from '../track/geo';
import { createSampler, type SampledPosition } from '../track/sampler';

export type Phase = 'intro' | 'main' | 'outro';

/** Everything needed to draw one moment of the flyover. Preview and export both render these. */
export interface Frame {
  /** Video time in seconds. */
  time: number;
  phase: Phase;
  /** Metres travelled along the track. */
  distance: number;
  /** Fraction of the track travelled (by distance), 0..1. */
  progress: number;
  position: SampledPosition;
  camera: CameraState;
}

export interface Timeline {
  /** Total video length in seconds. */
  readonly duration: number;
  readonly introDuration: number;
  readonly mainDuration: number;
  readonly outroDuration: number;
  /** Track length in metres. */
  readonly length: number;
  /** Zoom of the chase camera during the main phase. */
  readonly chaseZoom: number;
  at(time: number): Frame;
}

export interface TimelineOptions {
  viewport: Viewport;
  /** Seconds spent travelling the route. Default scales with distance (see defaultMainDuration). */
  mainDuration?: number;
  introDuration?: number;
  outroDuration?: number;
  /** Chase camera pitch in degrees. */
  pitch?: number;
  smoothing?: SmoothOptions;
}

export const INTRO_HOLD = 1; // seconds of still overview before the camera moves
export const OUTRO_HOLD = 1.5;
export const CHASE_OFFSET_Y = 0.2;
/** Fraction of the main phase spent accelerating (and again decelerating). */
export const RAMP = 0.08;

/** 20 s plus 2 s per km, between 20 s and 2 min. */
export function defaultMainDuration(lengthMetres: number): number {
  return Math.min(120, Math.max(20, 20 + (2 * lengthMetres) / 1000));
}

/**
 * The single source of truth for the flyover: maps video time to camera, route progress and
 * position. Pure and deterministic, so the preview, the exporter and tests all agree.
 */
export function createTimeline(points: readonly TrackPoint[], options: TimelineOptions): Timeline {
  const sampler = createSampler(points);
  const { length } = sampler;
  const smooth = createSmoothCamera(sampler, options.smoothing ?? defaultSmoothOptions(length));
  const introDuration = options.introDuration ?? 4;
  const outroDuration = options.outroDuration ?? 4;
  const mainDuration = options.mainDuration ?? defaultMainDuration(length);
  const duration = introDuration + mainDuration + outroDuration;
  const pitch = options.pitch ?? 60;
  const { viewport } = options;

  const box = bbox(points);
  const midLat = (box[1] + box[3]) / 2;
  const overview = fitBounds(box, viewport);
  const chaseZoom = zoomForGroundSpeed(length / mainDuration, midLat, viewport.height);

  const overviewCamera: CameraState = { ...overview, pitch: 0, bearing: 0, offsetY: 0 };
  const outroCamera: CameraState = {
    ...overview,
    zoom: overview.zoom - 0.3, // pitched views show more ground near the top; leave room
    pitch: 40,
    bearing: smooth.heading(length),
    offsetY: 0,
  };

  function chase(distance: number): CameraState {
    return {
      center: smooth.center(distance),
      zoom: chaseZoom,
      pitch,
      bearing: smooth.heading(distance),
      offsetY: CHASE_OFFSET_Y,
    };
  }

  function frame(time: number, phase: Phase, distance: number, camera: CameraState): Frame {
    return {
      time,
      phase,
      distance,
      progress: length > 0 ? distance / length : 1,
      position: sampler.at(distance),
      camera,
    };
  }

  return {
    duration,
    introDuration,
    mainDuration,
    outroDuration,
    length,
    chaseZoom,
    at(time) {
      const t = Math.min(duration, Math.max(0, time));
      if (t < introDuration) {
        const u = Math.max(0, (t - INTRO_HOLD) / (introDuration - INTRO_HOLD));
        return frame(t, 'intro', 0, interpolateCamera(overviewCamera, chase(0), easeInOutCubic(u)));
      }
      if (t <= introDuration + mainDuration) {
        const distance = length * travelProfile((t - introDuration) / mainDuration);
        return frame(t, 'main', distance, chase(distance));
      }
      const u = Math.min(1, (t - introDuration - mainDuration) / (outroDuration - OUTRO_HOLD));
      return frame(
        t,
        'outro',
        length,
        interpolateCamera(chase(length), outroCamera, easeInOutCubic(u)),
      );
    },
  };
}

/**
 * Fraction of the route travelled at fraction `u` of the main phase: accelerate over RAMP,
 * cruise, then brake over RAMP (a trapezoidal speed profile, so speed is continuous).
 */
export function travelProfile(u: number, ramp = RAMP): number {
  const x = Math.min(1, Math.max(0, u));
  const vmax = 1 / (1 - ramp);
  if (x < ramp) return (vmax * x * x) / (2 * ramp);
  if (x > 1 - ramp) return 1 - (vmax * (1 - x) ** 2) / (2 * ramp);
  return vmax * (ramp / 2 + (x - ramp));
}
