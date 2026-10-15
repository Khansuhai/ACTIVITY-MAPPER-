import { create } from 'zustand';
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

/** How the flyover looks and sounds. Shared by the preview and the exporter. */
interface LookState {
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
  set(patch: Partial<Omit<LookState, 'set' | 'setMusicFile' | 'setCustomIcon'>>): void;
  setCustomIcon(file: File): Promise<void>;
  setMusicFile(file: File | null): Promise<void>;
}

export const useLook = create<LookState>()((set, get) => ({
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
