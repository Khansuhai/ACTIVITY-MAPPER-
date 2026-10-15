import type { ElevationFn } from '../camera/clearance';
import type { CameraStyle } from '../camera/styles';
import type { Track } from '../import';
import { createTimeline, type PhotoStop, type Timeline } from '../timeline/timeline';
import { planDurations } from './plan';

/**
 * Timing shared by the preview and the exporter. Kept apart from exporter.ts so the app does not
 * load Mediabunny and the export map until the user exports.
 */
export const INTRO_SECONDS = 4;
export const OUTRO_SECONDS = 5;

/** Everything that decides what the flyover looks like over time. */
export interface FlyoverSettings {
  /** Target video length in seconds. */
  length: number;
  stops: readonly PhotoStop[];
  /** Seconds each photo is shown, or null to fit them into the length automatically. */
  photoSeconds: number | null;
  cameraStyle: CameraStyle;
  /** Distances (m, along the shown route) the cinematic camera swings around. */
  highlights: readonly number[];
  terrain?: { elevationAt: ElevationFn; exaggeration: number };
}

/** Builds the timeline; the preview and the exporter both call this, so they always match. */
export function exportTimeline(
  track: Track,
  viewport: { width: number; height: number },
  settings: FlyoverSettings,
): Timeline {
  const { travelDuration, photoDuration } = planDurations(
    settings.length,
    settings.stops.length,
    INTRO_SECONDS,
    OUTRO_SECONDS,
    settings.photoSeconds,
  );
  return createTimeline(track.points, {
    viewport,
    travelDuration,
    photos: settings.stops,
    photoDuration,
    introDuration: INTRO_SECONDS,
    outroDuration: OUTRO_SECONDS,
    terrain: settings.terrain,
    cameraStyle: settings.cameraStyle,
    highlights: settings.highlights,
  });
}

/** Can this browser encode video at all? Returns null if yes, else a message for the user. */
export function exportSupportProblem(): string | null {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return (
      'This browser cannot encode video (no WebCodecs). Use a current Chrome or Edge ' +
      '(desktop or Android), Safari 26+, or Firefox 130+ on desktop.'
    );
  }
  return null;
}
