import { useCallback, useMemo, useRef, useState } from 'react';
import { BASEMAPS, DEFAULT_BASEMAP, getBasemap } from '../basemaps/registry';
import { DEFAULT_TERRAIN } from '../basemaps/terrain';
import type { Viewport } from '../camera/camera';
import { ACCEPTED_EXTENSIONS, ImportError, importActivity, type Track } from '../import';
import { createTimeline } from '../timeline/timeline';
import { computeStats } from '../track/stats';
import { FlyoverMap } from '../ui/FlyoverMap';
import { PlayerControls } from '../ui/PlayerControls';
import { StatsPanel } from '../ui/StatsPanel';
import { useFileDrop } from '../ui/useFileDrop';
import { usePlayer } from './player';

const SAMPLE_URL = './samples/sample-hike.gpx';

interface Loaded {
  track: Track;
  fileName: string;
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [basemapId, setBasemapId] = useState<string>(DEFAULT_BASEMAP.id);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (fileName: string, read: () => Promise<ArrayBuffer>) => {
    setBusy(true);
    setError(null);
    try {
      const track = await importActivity(await read(), fileName);
      usePlayer.getState().reset();
      setLoaded({ track, fileName });
    } catch (e) {
      console.error(e);
      setError(
        e instanceof ImportError ? e.message : `Could not open ${fileName}. Is it a valid file?`,
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const loadFile = useCallback(
    (file: File) => void load(file.name, () => file.arrayBuffer()),
    [load],
  );
  const loadSample = () =>
    void load('sample-hike.gpx', async () => {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    });

  const dragging = useFileDrop(loadFile);
  const stats = useMemo(() => (loaded ? computeStats(loaded.track.points) : null), [loaded]);
  const basemap = getBasemap(basemapId);
  // The timeline depends on the viewport: overview zoom fits the route to the map's size.
  const timeline = useMemo(
    () => (loaded && viewport ? createTimeline(loaded.track.points, { viewport }) : null),
    [loaded, viewport],
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-slate-800 bg-slate-950 p-5 md:w-96 md:border-r">
        <header className="flex items-center gap-2.5">
          <img src="./favicon.svg" alt="" className="h-8 w-8" />
          <h1 className="text-xl font-bold tracking-tight">OpenFlyover</h1>
        </header>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
          >
            {loaded ? 'Open another file' : 'Open activity file'}
          </button>
          {!loaded && (
            <button
              type="button"
              onClick={loadSample}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
            >
              Try a sample
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
              e.target.value = ''; // allow re-selecting the same file
            }}
          />
        </div>

        {busy && <p className="text-sm text-slate-400">Reading file…</p>}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-red-900 bg-red-950/60 p-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        {loaded && stats ? (
          <StatsPanel track={loaded.track} stats={stats} fileName={loaded.fileName} />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 p-5 text-sm text-slate-400">
            <p className="font-medium text-slate-200">Drop a GPX, TCX, FIT or KML file anywhere.</p>
            <p className="mt-2">
              Export it from Garmin Connect, COROS, Strava, Komoot or your watch&rsquo;s USB drive.
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Map style</span>
          <select
            value={basemapId}
            onChange={(e) => setBasemapId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          >
            {BASEMAPS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-auto text-xs text-slate-500">
          🔒 Your files are processed in this browser and never uploaded.
        </p>
      </aside>

      <main className="relative flex min-h-[70vh] flex-1 flex-col">
        <div className="relative flex-1">
          <FlyoverMap
            track={loaded?.track ?? null}
            timeline={timeline}
            basemap={basemap}
            terrain={DEFAULT_TERRAIN}
            onViewportChange={setViewport}
          />
        </div>
        {timeline && <PlayerControls timeline={timeline} />}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center border-4 border-dashed border-orange-400 bg-slate-950/70">
            <p className="text-2xl font-semibold text-white">Drop to load your activity</p>
          </div>
        )}
      </main>
    </div>
  );
}
