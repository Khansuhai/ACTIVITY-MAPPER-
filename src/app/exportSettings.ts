import { create } from 'zustand';
import { INTRO_SECONDS, OUTRO_SECONDS } from '../export/timing';
import { type Aspect, type Fps, MAX_LENGTH_S, MIN_LENGTH_S, type Resolution } from '../export/plan';
import { defaultMainDuration, PHOTO_DURATION } from '../timeline/timeline';

interface ExportSettings {
  aspect: Aspect;
  resolution: Resolution;
  fps: Fps;
  /** Target video length in seconds, or null for automatic. */
  length: number | null;
  set(patch: Partial<Omit<ExportSettings, 'set'>>): void;
}

export const useExportSettings = create<ExportSettings>()((set) => ({
  aspect: '16:9',
  resolution: '1080p',
  fps: 60,
  length: null,
  set: (patch) => set(patch),
}));

/** Automatic length: the route's natural pace plus 4 s per photo, kept within 15 s to 3 min. */
export function autoLength(routeMetres: number, photoCount: number): number {
  const natural =
    INTRO_SECONDS + defaultMainDuration(routeMetres) + photoCount * PHOTO_DURATION + OUTRO_SECONDS;
  return Math.round(Math.min(MAX_LENGTH_S, Math.max(MIN_LENGTH_S, natural)));
}

export function aspectRatio(aspect: Aspect): number {
  return aspect === '16:9' ? 16 / 9 : aspect === '9:16' ? 9 / 16 : 1;
}
