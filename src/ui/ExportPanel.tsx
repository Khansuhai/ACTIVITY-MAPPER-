import { useEffect, useRef, useState } from 'react';
import { useExportSettings } from '../app/exportSettings';
import { usePlayer } from '../app/player';
import type { ExportOptions, ExportProgress } from '../export/exporter';
import { exportSupportProblem } from '../export/timing';
import {
  ASPECTS,
  type Fps,
  MAX_LENGTH_S,
  MIN_LENGTH_S,
  type Resolution,
  RESOLUTIONS,
  videoSize,
} from '../export/plan';
import { formatDuration } from './format';

interface ExportPanelProps {
  /** Everything except the settings this panel owns; null when no activity is loaded. */
  base: Omit<ExportOptions, 'aspect' | 'resolution' | 'fps' | 'length' | 'file'> | null;
  /** Current length in seconds (the automatic one when the user has not chosen). */
  length: number;
  fileName: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress | null }
  | { kind: 'done'; url: string | null; savedTo: string | null; sizeMb: number | null }
  | { kind: 'error'; message: string };

const RESOLUTION_LABELS: Record<Resolution, string> = {
  '720p': '720p',
  '1080p': '1080p',
  '4k': '4K',
};
const canStreamToFile = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

/** Export settings, progress with cancel, and the finished video. */
export function ExportPanel({ base, length, fileName }: ExportPanelProps) {
  const settings = useExportSettings();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [toFile, setToFile] = useState(canStreamToFile);
  const abortRef = useRef<AbortController | null>(null);
  const unsupported = exportSupportProblem();
  const { width, height } = videoSize(settings.aspect, settings.resolution);

  // Free the previous video's memory when a new one is made or the panel goes away.
  const url = status.kind === 'done' ? status.url : null;
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  // Warn about a hidden tab: browsers pause rendering there, and the export with it.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const start = async () => {
    if (!base) return;
    // The save dialog must open straight from the click (browsers require a user gesture).
    let file: FileSystemFileHandle | null = null;
    if (toFile && canStreamToFile) {
      try {
        file = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
        });
      } catch {
        return; // dialog cancelled
      }
    }
    usePlayer.getState().pause();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'running', progress: null });
    try {
      // Mediabunny and the export map load only now, not with the app.
      const { exportVideo } = await import('../export/exporter');
      const blob = await exportVideo(
        { ...base, ...settings, length, file },
        (progress) => setStatus({ kind: 'running', progress }),
        controller.signal,
      );
      setStatus({
        kind: 'done',
        url: blob ? URL.createObjectURL(blob) : null,
        savedTo: file ? file.name : null,
        sizeMb: blob ? blob.size / 1e6 : null,
      });
    } catch (e) {
      if (controller.signal.aborted) setStatus({ kind: 'idle' });
      else {
        console.error(e);
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const running = status.kind === 'running';
  const select =
    'rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-50';

  return (
    <section aria-labelledby="export-title" className="space-y-3">
      <h2 id="export-title" className="font-semibold text-white">
        Export video
      </h2>
      {unsupported ? (
        <p className="rounded-md border border-amber-800 bg-amber-950/60 p-3 text-sm text-amber-200">
          {unsupported}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label className="flex flex-col gap-1 text-slate-400">
              Shape
              <select
                className={select}
                disabled={running}
                value={settings.aspect}
                onChange={(e) => settings.set({ aspect: e.target.value as typeof settings.aspect })}
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {a === '16:9' ? '16:9 YouTube' : a === '9:16' ? '9:16 Reels' : '1:1 Square'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-slate-400">
              Quality
              <select
                className={select}
                disabled={running}
                value={settings.resolution}
                onChange={(e) => settings.set({ resolution: e.target.value as Resolution })}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RESOLUTION_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-slate-400">
              Frame rate
              <select
                className={select}
                disabled={running}
                value={settings.fps}
                onChange={(e) => settings.set({ fps: Number(e.target.value) as Fps })}
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </label>
          </div>

          <label className="block text-sm text-slate-400">
            <span className="flex justify-between">
              <span>Length</span>
              <span className="text-slate-200 tabular-nums">
                {formatDuration(length)}
                {settings.length === null ? ' (auto)' : ''}
              </span>
            </span>
            <input
              type="range"
              min={MIN_LENGTH_S}
              max={MAX_LENGTH_S}
              step={1}
              value={length}
              disabled={running}
              onChange={(e) => settings.set({ length: Number(e.target.value) })}
              className="w-full accent-orange-500"
            />
          </label>

          {canStreamToFile && (
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={toFile}
                disabled={running}
                onChange={(e) => setToFile(e.target.checked)}
                className="accent-orange-500"
              />
              Save straight to a file (best for long or 4K videos)
            </label>
          )}

          {running ? (
            <Progress
              progress={status.progress}
              onCancel={() => abortRef.current?.abort(new DOMException('Cancelled', 'AbortError'))}
            />
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={!base}
              className="w-full rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:opacity-40"
            >
              Export {width}×{height} MP4
            </button>
          )}

          {running && hidden && (
            <p role="alert" className="text-sm text-amber-300">
              Keep this tab visible: browsers pause rendering in background tabs.
            </p>
          )}
          {status.kind === 'done' && (
            <div className="rounded-md border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-200">
              {status.url ? (
                <a href={status.url} download={fileName} className="font-semibold underline">
                  Save video ({status.sizeMb?.toFixed(1)} MB)
                </a>
              ) : (
                <span>Saved to {status.savedTo}.</span>
              )}
            </div>
          )}
          {status.kind === 'error' && (
            <p
              role="alert"
              className="rounded-md border border-red-900 bg-red-950/60 p-3 text-sm text-red-200"
            >
              Export failed: {status.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Progress({ progress, onCancel }: { progress: ExportProgress | null; onCancel(): void }) {
  const fraction = progress ? progress.frame / progress.totalFrames : 0;
  const eta =
    progress && progress.frame > 10
      ? (progress.elapsed / progress.frame) * (progress.totalFrames - progress.frame)
      : null;
  return (
    <div className="space-y-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="h-2 overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className="h-full bg-orange-500 transition-[width]"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-sm text-slate-400 tabular-nums">
        <span>
          {progress
            ? `Frame ${progress.frame} of ${progress.totalFrames}${eta !== null ? ` · ${formatDuration(eta)} left` : ''}`
            : 'Preparing map…'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-700 px-3 py-1 text-slate-200 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
