import type { ElevationFn } from '../camera/clearance';
import type { Track } from '../import';
import { createTimeline, type PhotoStop, type Timeline } from '../timeline/timeline';
import { planDurations } from './plan';

/**
 * Timing shared by the preview and the exporter. Kept apart from exporter.ts so the app does not
 * load Mediabunny and the export map until the user exports.
 */
export const INTRO_SECONDS = 4;
export const OUTRO_SECONDS = 5;

/** Builds the timeline for given settings; shared with the preview so both have the same timing. */
export function exportTimeline(
  track: Track,
  viewport: { width: number; height: number },
  length: number,
  stops: readonly PhotoStop[],
  terrain?: { elevationAt: ElevationFn; exaggeration: number },
): Timeline {
  const { travelDuration, photoDuration } = planDurations(
    length,
    stops.length,
    INTRO_SECONDS,
    OUTRO_SECONDS,
  );
  return createTimeline(track.points, {
    viewport,
    travelDuration,
    photos: stops,
    photoDuration,
    introDuration: INTRO_SECONDS,
    outroDuration: OUTRO_SECONDS,
    terrain,
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
