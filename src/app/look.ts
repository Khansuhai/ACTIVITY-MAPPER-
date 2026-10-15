import { create } from 'zustand';
import type { CameraStyle } from '../camera/styles';
import type { IconId } from '../render/icons';
import type { ThemeId } from '../render/theme';
import type { ColorBy } from '../track/colorize';

export interface Music {
  name: string;
  /** For the preview's <audio> element. */
  url: string;
  /** Decoded samples, for mixing into the exported video. */
  buffer: AudioBuffer;
}

/** A note shown when the flyover passes a point ("Lunch break 🍕"). */
export interface Moment {
  id: string;
  /** Metres along the whole activity (not the privacy-cut route). */
  distance: number;
  text: string;
}

/** How the flyover looks and sounds. Shared by the preview and the exporter. */
interface LookState {
  cameraStyle: CameraStyle;
  /** Seconds each photo is shown, or null for automatic. */
  photoSeconds: number | null;
  /** Video title; null uses the activity's name. */
  title: string | null;
  moments: Moment[];
  themeId: ThemeId;
  colorBy: ColorBy;
  /** 'auto' picks an icon from the activity's sport. */
  marker: 'auto' | 'dot' | IconId | 'custom';
  customIcon: ImageBitmap | null;
  /** Metres hidden around the start and finish (0 = off). */
  privacyRadius: number;
  /** Summit and pass names from the map data. */
  showPeaks: boolean;
  /** Highest point and fastest km. */
  showHighlights: boolean;
  music: Music | null;
  /** 0..1 */
  musicVolume: number;
  set(
    patch: Partial<
      Omit<LookState, 'set' | 'setMusicFile' | 'setCustomIcon' | 'addMoment' | 'removeMoment'>
    >,
  ): void;
  addMoment(distance: number, text: string): void;
  removeMoment(id: string): void;
  setCustomIcon(file: File): Promise<void>;
  setMusicFile(file: File | null): Promise<void>;
}

export const useLook = create<LookState>()((set, get) => ({
  cameraStyle: 'chase',
  photoSeconds: null,
  title: null,
  moments: [],
  themeId: 'sunset',
  colorBy: 'solid',
  marker: 'auto',
  customIcon: null,
  privacyRadius: 0,
  showPeaks: true,
  showHighlights: true,
  music: null,
  musicVolume: 0.8,
  set: (patch) => set(patch),
  addMoment: (distance, text) =>
    set((s) => ({
      moments: [...s.moments, { id: crypto.randomUUID(), distance, text }].sort(
        (a, b) => a.distance - b.distance,
      ),
    })),
  removeMoment: (id) => set((s) => ({ moments: s.moments.filter((m) => m.id !== id) })),
  async setCustomIcon(file) {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeHeight: 256,
      resizeQuality: 'high',
    });
    get().customIcon?.close();
    set({ customIcon: bitmap, marker: 'custom' });
  },
  async setMusicFile(file) {
    const old = get().music;
    if (old) URL.revokeObjectURL(old.url);
    if (!file) return set({ music: null });
    // Decoding needs an AudioContext; the browser picks what it can decode (MP3, AAC, WAV, ...).
    const ctx = new AudioContext();
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      set({ music: { name: file.name, url: URL.createObjectURL(file), buffer } });
    } finally {
      void ctx.close();
    }
  },
}));
