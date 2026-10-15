import { useEffect } from 'react';
import { usePlayer } from '../app/player';
import type { Timeline } from '../timeline/timeline';
import { formatDuration } from './format';

interface PlayerControlsProps {
  timeline: Timeline;
}

/** Play/pause, scrub bar and terrain height. Space toggles playback. */
export function PlayerControls({ timeline }: PlayerControlsProps) {
  const time = usePlayer((s) => s.time);
  const playing = usePlayer((s) => s.playing);
  const exaggeration = usePlayer((s) => s.exaggeration);
  const { seek, play, pause, setExaggeration } = usePlayer.getState();
  const { duration } = timeline;

  usePlaybackLoop(duration);

  const toggle = () => {
    if (playing) return pause();
    if (time >= duration) seek(0); // replay from the start
    play();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return;
      e.preventDefault();
      const s = usePlayer.getState();
      if (s.playing) s.pause();
      else {
        if (s.time >= duration) s.seek(0);
        s.play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800 bg-slate-950 px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="ml-0.5 h-5 w-5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
          </svg>
        )}
      </button>

      <label className="flex min-w-48 flex-1 items-center gap-3">
        <span className="sr-only">Position in video</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.01}
          value={time}
          onChange={(e) => {
            pause();
            seek(Number(e.target.value));
          }}
          className="w-full accent-orange-500"
        />
        <span className="shrink-0 text-sm text-slate-300 tabular-nums">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-400">
        Terrain
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={exaggeration}
          onChange={(e) => setExaggeration(Number(e.target.value))}
          className="w-24 accent-orange-500"
        />
        <span className="w-8 text-slate-300 tabular-nums">{exaggeration.toFixed(1)}×</span>
      </label>
    </div>
  );
}

/** Advances player time with real time while playing. */
function usePlaybackLoop(duration: number) {
  const playing = usePlayer((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const { time, seek, pause } = usePlayer.getState();
      const next = time + (now - last) / 1000;
      last = now;
      if (next >= duration) {
        seek(duration);
        pause();
        return;
      }
      seek(next);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
  );
}
