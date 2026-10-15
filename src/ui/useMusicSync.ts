import { useEffect } from 'react';
import { usePlayer } from '../app/player';
import { musicGain, musicOffset } from '../audio/mix';

/** Re-sync the audio when it drifts more than this from the video clock (seconds). */
const MAX_DRIFT_S = 0.15;

/**
 * Plays the chosen music with the preview: follows play, pause and scrubbing, loops, and applies
 * the same fades as the exported soundtrack.
 */
export function useMusicSync(url: string | null, videoDuration: number, volume: number) {
  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = 'auto';

    const sync = (time: number, playing: boolean) => {
      audio.volume = Math.max(0, Math.min(1, volume * musicGain(time, videoDuration)));
      const target = Number.isFinite(audio.duration) ? musicOffset(time, audio.duration) : time;
      if (Math.abs(audio.currentTime - target) > MAX_DRIFT_S) audio.currentTime = target;
      if (playing && audio.paused) void audio.play().catch(() => undefined);
      if (!playing && !audio.paused) audio.pause();
    };
    const { time, playing } = usePlayer.getState();
    sync(time, playing);
    const unsubscribe = usePlayer.subscribe((s) => sync(s.time, s.playing));
    return () => {
      unsubscribe();
      audio.pause();
      audio.src = '';
    };
  }, [url, videoDuration, volume]);
}
