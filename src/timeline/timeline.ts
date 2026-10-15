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
  /** The photo being shown (the flyover is paused at it), or null. */
  photo: { id: string; progress: number } | null;
}

/** A photo placed on the route, where the flyover stops to show it. */
export interface PhotoStop {
  id: string;
  /** Metres along the route. */
  distance: number;
}

export interface Timeline {
  /** Total video length in seconds. */
  readonly duration: number;
  readonly introDuration: number;
  /** Travel time plus photo stops. */
  readonly mainDuration: number;
  /** Seconds spent moving along the route (excludes photo stops). */
  readonly travelDuration: number;
  readonly outroDuration: number;
  /** Track length in metres. */
  readonly length: number;
  /** Zoom of the chase camera during the main phase. */
  readonly chaseZoom: number;
  at(time: number): Frame;
}

export interface TimelineOptions {
  viewport: Viewport;
  /** Seconds spent moving along the route. Default scales with distance (see defaultMainDuration). */
  travelDuration?: number;
  /** Photos to stop at, in any order. */
  photos?: readonly PhotoStop[];
  /** Seconds each photo is shown. */
  photoDuration?: number;
  introDuration?: number;
  outroDuration?: number;
  /** Chase camera pitch in degrees. */
  pitch?: number;
  smoothing?: SmoothOptions;
}

export const INTRO_HOLD = 1; // seconds of still overview before the camera moves
/** Seconds the final overview holds still, under the end card. */
export const OUTRO_HOLD = 2.5;
export const CHASE_OFFSET_Y = 0.2;
/** Default fraction of a travel segment spent accelerating (and again decelerating). */
export const RAMP = 0.08;
/** Seconds to accelerate away from, or brake for, a stop. */
export const RAMP_SECONDS = 2;
export const PHOTO_DURATION = 4;

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
  const outroDuration = options.outroDuration ?? 5;
  const travelDuration = options.travelDuration ?? defaultMainDuration(length);
  const schedule = buildSchedule(
    length,
    travelDuration,
    options.photos ?? [],
    options.photoDuration ?? PHOTO_DURATION,
  );
  const mainDuration = schedule.duration;
  const duration = introDuration + mainDuration + outroDuration;
  const pitch = options.pitch ?? 60;
  const { viewport } = options;

  const box = bbox(points);
  const midLat = (box[1] + box[3]) / 2;
  const overview = fitBounds(box, viewport);
  // The short side, not the height: a 9:16 video should show the ground at the same scale as a
  // 16:9 one, not 1.78x further out.
  const chaseZoom = zoomForGroundSpeed(
    length / travelDuration,
    midLat,
    Math.min(viewport.width, viewport.height),
  );

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

  function frame(
    time: number,
    phase: Phase,
    distance: number,
    camera: CameraState,
    photo: Frame['photo'] = null,
  ): Frame {
    return {
      time,
      phase,
      distance,
      progress: length > 0 ? distance / length : 1,
      position: sampler.at(distance),
      camera,
      photo,
    };
  }

  return {
    duration,
    introDuration,
    mainDuration,
    travelDuration,
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
        const { distance, photo } = schedule.at(t - introDuration);
        return frame(t, 'main', distance, chase(distance), photo);
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

type ScheduleItem =
  | { kind: 'travel'; start: number; end: number; from: number; to: number }
  | { kind: 'photo'; start: number; end: number; at: number; id: string };

/**
 * The main phase as a list of travel segments and photo stops. Every travel segment eases in and
 * out (trapezoidal speed), so the camera brakes smoothly for each photo and accelerates away.
 * Segment durations are proportional to segment length.
 */
export function buildSchedule(
  length: number,
  travelDuration: number,
  photos: readonly PhotoStop[],
  photoDuration: number,
) {
  const stops = [...photos]
    .map((p) => ({ ...p, distance: Math.min(length, Math.max(0, p.distance)) }))
    .sort((a, b) => a.distance - b.distance);
  const items: ScheduleItem[] = [];
  let t = 0;
  let from = 0;
  const travel = (to: number) => {
    const d = length > 0 ? (travelDuration * (to - from)) / length : 0;
    if (d > 0) items.push({ kind: 'travel', start: t, end: t + d, from, to });
    t += d;
    from = to;
  };
  for (const stop of stops) {
    travel(stop.distance);
    items.push({ kind: 'photo', start: t, end: t + photoDuration, at: stop.distance, id: stop.id });
    t += photoDuration;
  }
  travel(length);
  if (length === 0 && stops.length === 0) t = travelDuration; // nothing moves, but keep the length

  return {
    duration: t,
    items,
    /** Distance and photo at `time` seconds into the main phase. */
    at(time: number): { distance: number; photo: Frame['photo'] } {
      // Binary search for the item containing `time`.
      let lo = 0;
      let hi = items.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (items[mid]!.start <= time) lo = mid;
        else hi = mid - 1;
      }
      const item = items[lo];
      if (!item) return { distance: time > 0 ? length : 0, photo: null };
      const u = Math.min(1, Math.max(0, (time - item.start) / (item.end - item.start)));
      if (item.kind === 'photo') {
        return { distance: item.at, photo: { id: item.id, progress: u } };
      }
      const ramp = Math.min(0.5, RAMP_SECONDS / (item.end - item.start));
      return {
        distance: item.from + (item.to - item.from) * travelProfile(u, ramp),
        photo: null,
      };
    },
  };
}

/**
 * Fraction of a segment travelled at fraction `u` of its time: accelerate over RAMP,
 * cruise, then brake over RAMP (a trapezoidal speed profile, so speed is continuous).
 * `ramp` must be in (0, 0.5].
 */
export function travelProfile(u: number, ramp = RAMP): number {
  const x = Math.min(1, Math.max(0, u));
  const vmax = 1 / (1 - ramp);
  if (x < ramp) return (vmax * x * x) / (2 * ramp);
  if (x > 1 - ramp) return 1 - (vmax * (1 - x) ** 2) / (2 * ramp);
  return vmax * (ramp / 2 + (x - ramp));
}
