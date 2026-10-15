import { create } from 'zustand';

/** Playback state shared by the map, the controls and (later) the exporter. */
interface PlayerState {
  /** Video time in seconds. */
  time: number;
  playing: boolean;
  /** Terrain height multiplier. */
  exaggeration: number;
  seek(time: number): void;
  play(): void;
  pause(): void;
  setExaggeration(value: number): void;
  reset(): void;
}

export const usePlayer = create<PlayerState>()((set) => ({
  time: 0,
  playing: false,
  // 1.0 = true scale. Higher values look dramatic but let ridges hide the marker (DECISIONS.md, D15).
  exaggeration: 1,
  seek: (time) => set({ time }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  setExaggeration: (exaggeration) => set({ exaggeration }),
  reset: () => set({ time: 0, playing: false }),
}));
