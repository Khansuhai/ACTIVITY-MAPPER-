import { create } from 'zustand';
import { type LiveStats, Recorder } from '../record/recorder';
import { takePhoto, watchLocation } from '../record/platform';
import { defaultTripName, type Trip } from '../record/trip';
import { clearDraft, type Draft, saveDraft } from '../record/tripStore';

/** How often the live numbers refresh, and how often a crash-safe draft is written. */
const TICK_MS = 1000;
const DRAFT_MS = 10_000;

interface RecordingState {
  sport: string;
  stats: LiveStats | null;
  error: string | null;
  photoCount: number;
  /** A finished recording waiting for a name before it is saved. */
  finished: { trip: Trip; photos: Record<string, Blob> } | null;
  setSport(sport: string): void;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  finish(): Promise<void>;
  takePhoto(): Promise<void>;
  /** Drops the finished recording (after saving it, or if the user discards it). */
  clearFinished(): void;
  /** Re-opens a draft left by a crash, as a finished recording to name and save. */
  recoverDraft(draft: Draft): void;
}

// Live objects, outside React state.
let recorder: Recorder | null = null;
let stopGps: (() => void) | null = null;
let photos: Record<string, Blob> = {};
let tick: ReturnType<typeof setInterval> | null = null;
let lastDraft = 0;
let tripId = '';

export const useRecording = create<RecordingState>()((set, get) => {
  const refresh = () => {
    if (!recorder) return;
    const now = Date.now();
    set({ stats: recorder.stats(now), photoCount: recorder.photos.length });
    if (now - lastDraft > DRAFT_MS && recorder.state !== 'idle') {
      lastDraft = now;
      void saveDraft({
        trip: toTrip(recorder, get().sport, tripId),
        photos,
        state: recorder.state,
      }).catch(() => undefined);
    }
  };

  return {
    sport: 'running',
    stats: null,
    error: null,
    photoCount: 0,
    finished: null,
    setSport: (sport) => set({ sport }),

    async start() {
      if (recorder && recorder.state !== 'finished') return;
      recorder = new Recorder();
      photos = {};
      tripId = crypto.randomUUID();
      set({ error: null, finished: null, photoCount: 0 });
      try {
        stopGps = await watchLocation(
          (fix) => {
            recorder?.addFix(fix);
            if (get().error) set({ error: null });
          },
          (message) => set({ error: message }),
        );
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        recorder = null;
        return;
      }
      recorder.start(Date.now());
      tick = setInterval(refresh, TICK_MS);
      refresh();
    },

    pause() {
      recorder?.pause(Date.now());
      refresh();
    },

    resume() {
      recorder?.resume(Date.now());
      refresh();
    },

    async finish() {
      if (!recorder) return;
      recorder.finish(Date.now());
      stopGps?.();
      stopGps = null;
      if (tick) clearInterval(tick);
      tick = null;
      refresh();
      const trip = toTrip(recorder, get().sport, tripId);
      set({ finished: { trip, photos } });
      await saveDraft({ trip, photos, state: 'finished' }).catch(() => undefined);
    },

    async takePhoto() {
      if (!recorder) return;
      const blob = await takePhoto();
      if (!blob) return;
      const id = crypto.randomUUID();
      if (recorder.addPhoto(id, Date.now())) {
        photos[id] = blob;
        lastDraft = 0; // write the draft soon, so the photo survives a crash
        refresh();
      } else {
        set({ error: 'No GPS position yet: wait a moment, then take the photo again.' });
      }
    },

    clearFinished() {
      recorder = null;
      photos = {};
      set({ finished: null, stats: null, photoCount: 0 });
      void clearDraft().catch(() => undefined);
    },

    recoverDraft(draft) {
      set({ finished: { trip: draft.trip, photos: draft.photos }, sport: draft.trip.sport });
    },
  };
});

function toTrip(r: Recorder, sport: string, id: string): Trip {
  const stats = r.stats(Date.now());
  const createdAt = r.points[0]?.time ?? Date.now();
  return {
    id,
    name: defaultTripName(sport, createdAt),
    sport,
    createdAt,
    points: [...r.points],
    segmentStarts: [...r.segmentStarts],
    photos: [...r.photos],
    distance: stats.distance,
    movingTime: stats.movingTime,
  };
}
