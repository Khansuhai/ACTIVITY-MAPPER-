import { useCallback, useMemo, useRef, useState } from 'react';
import { BASEMAPS, DEFAULT_BASEMAP, getBasemap } from '../basemaps/registry';
import { DEFAULT_TERRAIN } from '../basemaps/terrain';
import type { Viewport } from '../camera/camera';
import { exportTimeline } from '../export/timing';
import { ACCEPTED_EXTENSIONS, ImportError, importActivity, type Track } from '../import';
import type { OverlayModel } from '../render/overlays';
import type { PhotoPin } from '../render/scene';
import { createLiveStats, elevationProfile } from '../track/live';
import { computeStats } from '../track/stats';
import { ExportPanel } from '../ui/ExportPanel';
import { FlyoverMap } from '../ui/FlyoverMap';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  prefersPace,
} from '../ui/format';
import { FrameOverlay } from '../ui/FrameOverlay';
import { PhotoPanel } from '../ui/PhotoPanel';
import { PlayerControls } from '../ui/PlayerControls';
import { StatsPanel } from '../ui/StatsPanel';
import { useFileDrop } from '../ui/useFileDrop';
import { aspectRatio, autoLength, useExportSettings } from './exportSettings';
import { isPhotoFile, usePhotos } from './photos';
import { usePhotoPlacements } from './placement';
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
  /** Dropped files: photos go to the photo list, the first other file is the activity. */
  const loadFiles = useCallback(
    (files: File[]) => {
      const photos = files.filter(isPhotoFile);
      if (photos.length > 0) usePhotos.getState().addFiles(photos);
      const activity = files.find((f) => !isPhotoFile(f));
      if (activity) loadFile(activity);
    },
    [loadFile],
  );
  const loadSample = () =>
    void load('sample-hike.gpx', async () => {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    });

  const dragging = useFileDrop(loadFiles);
  const stats = useMemo(() => (loaded ? computeStats(loaded.track.points) : null), [loaded]);
  const basemap = getBasemap(basemapId);
  const placements = usePhotoPlacements(loaded?.track ?? null);
  const aspect = useExportSettings((s) => s.aspect);
  const chosenLength = useExportSettings((s) => s.length);
  const length = chosenLength ?? autoLength(stats?.distance ?? 0, placements.stops.length);
  // The preview uses the export's timing, so what plays here is what gets exported. The
  // viewport matters too: the overview zoom fits the route to the map's size.
  const timeline = useMemo(
    () =>
      loaded && viewport ? exportTimeline(loaded.track, viewport, length, placements.stops) : null,
    [loaded, viewport, length, placements.stops],
  );
  const model = useMemo(
    () => (loaded && stats ? overlayModel(loaded, stats) : null),
    [loaded, stats],
  );
  const pins = useMemo<PhotoPin[]>(
    () =>
      placements.photos.flatMap((p) =>
        p.position && p.item.thumb ? [{ id: p.item.id, ...p.position, thumb: p.item.thumb }] : [],
      ),
    [placements.photos],
  );
  const photoBlobs = useMemo(
    () =>
      new Map(
        placements.photos.flatMap((p) => (p.item.display ? [[p.item.id, p.item.display]] : [])),
      ),
    [placements.photos],
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
            <p className="font-medium text-slate-200">
              Drop a GPX, TCX, FIT or KML file anywhere, with photos if you like.
            </p>
            <p className="mt-2">
              Export it from Garmin Connect, COROS, Strava, Komoot or your watch&rsquo;s USB drive.
            </p>
          </div>
        )}

        <PhotoPanel placements={placements} timeline={timeline} hasTrack={!!loaded} />

        <ExportPanel
          base={
            loaded && model
              ? {
                  track: loaded.track,
                  basemap,
                  terrain: DEFAULT_TERRAIN,
                  exaggeration: usePlayer.getState().exaggeration,
                  stops: placements.stops,
                  photoBlobs,
                  pins,
                  // Burned into the video, as the map and terrain licences require.
                  model: {
                    ...model,
                    attribution: `${basemap.attribution} · ${DEFAULT_TERRAIN.credit}`,
                  },
                }
              : null
          }
          length={length}
          fileName={`${slug(model?.title ?? 'flyover')}-${aspect.replace(':', 'x')}.mp4`}
        />

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
        {/* The preview takes the export's shape, letterboxed: what you see is what you get. */}
        <div
          className="flex flex-1 items-center justify-center bg-black"
          style={{ containerType: 'size' }}
        >
          <div
            className="relative"
            style={{
              width: `min(100cqw, calc(100cqh * ${aspectRatio(aspect)}))`,
              height: `min(100cqh, calc(100cqw / ${aspectRatio(aspect)}))`,
            }}
          >
            <FlyoverMap
              track={loaded?.track ?? null}
              timeline={timeline}
              basemap={basemap}
              terrain={DEFAULT_TERRAIN}
              pins={pins}
              onViewportChange={setViewport}
            />
            <FrameOverlay timeline={timeline} blobs={photoBlobs} model={model} />
          </div>
        </div>
        {timeline && <PlayerControls timeline={timeline} />}
        {dragging && (
          <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center border-4 border-dashed border-orange-400 bg-slate-950/70">
            <p className="text-2xl font-semibold text-white">Drop your activity and photos</p>
          </div>
        )}
      </main>
    </div>
  );
}

function overlayModel(loaded: Loaded, stats: ReturnType<typeof computeStats>): OverlayModel {
  const { track, fileName } = loaded;
  const pace = prefersPace(track.sport);
  const sport = track.sport ? track.sport.charAt(0).toUpperCase() + track.sport.slice(1) : null;
  return {
    title: track.name ?? fileName.replace(/\.[^.]+$/, ''),
    subtitle: [formatDate(stats.startTime), sport, formatDistance(stats.distance)]
      .filter(Boolean)
      .join(' · '),
    summary: [
      { label: 'Distance', value: formatDistance(stats.distance) },
      { label: 'Elevation gain', value: formatElevation(stats.elevationGain) },
      { label: 'Moving time', value: formatDuration(stats.movingTime) },
      pace
        ? { label: 'Avg pace', value: formatPace(stats.avgSpeed) }
        : { label: 'Avg speed', value: formatSpeed(stats.avgSpeed) },
    ],
    live: createLiveStats(track.points),
    profile: elevationProfile(track.points),
    pace,
    attribution: null,
  };
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'flyover'
  );
}
