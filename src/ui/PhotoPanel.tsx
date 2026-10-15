import { useEffect, useRef } from 'react';
import type { PhotoPlacements, PlacedPhoto } from '../app/placement';
import { usePhotos } from '../app/photos';
import { usePlayer } from '../app/player';
import type { Timeline } from '../timeline/timeline';

interface PhotoPanelProps {
  placements: PhotoPlacements;
  timeline: Timeline | null;
  hasTrack: boolean;
}

const ACCEPT = 'image/*,.heic,.heif';

/** Photo list with placement status, the add button and the camera clock correction. */
export function PhotoPanel({ placements, timeline, hasTrack }: PhotoPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addFiles, remove, setClockCorrection } = usePhotos.getState();
  const correction = usePhotos((s) => s.clockCorrectionMin);
  const { photos, suggestedCorrectionMin } = placements;
  const placed = photos.filter((p) => p.placement && p.placement.method !== 'none').length;
  const reading = photos.filter((p) => p.item.status === 'reading').length;

  /** Jump the player to the moment this photo is shown. */
  const showPhoto = (id: string) => {
    if (!timeline) return;
    // The timeline is cheap to probe: find the photo's stop at 10 fps resolution.
    for (let t = 0; t <= timeline.duration; t += 0.1) {
      const f = timeline.at(t);
      if (f.photo?.id === id && f.photo.progress > 0.3) {
        usePlayer.getState().pause();
        usePlayer.getState().seek(t);
        return;
      }
    }
  };

  return (
    <section aria-labelledby="photos-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="photos-title" className="font-semibold text-white">
          Photos
          {photos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {hasTrack ? `${placed} of ${photos.length} on the route` : `${photos.length}`}
              {reading > 0 && ` · reading ${reading}…`}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
        >
          Add photos
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Add photos from the activity (JPEG or HEIC). They are placed by GPS, or by the time they
          were taken, at full resolution.
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((p) => (
            <PhotoTile
              key={p.item.id}
              photo={p}
              onShow={() => showPhoto(p.item.id)}
              onRemove={() => remove(p.item.id)}
            />
          ))}
        </ul>
      )}

      {photos.length > 0 && hasTrack && (
        <div className="space-y-1 text-sm">
          <label className="flex items-center gap-2 text-slate-400">
            Camera clock
            <input
              type="number"
              step={1}
              value={correction}
              onChange={(e) => setClockCorrection(Number(e.target.value) || 0)}
              className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 tabular-nums"
              aria-describedby="clock-help"
            />
            min
            {suggestedCorrectionMin !== null && suggestedCorrectionMin !== correction && (
              <button
                type="button"
                onClick={() => setClockCorrection(suggestedCorrectionMin)}
                className="rounded-md px-2 py-1 text-orange-300 hover:bg-slate-800"
              >
                Auto: {suggestedCorrectionMin > 0 ? '+' : ''}
                {suggestedCorrectionMin} min
              </button>
            )}
          </label>
          <p id="clock-help" className="text-xs text-slate-500">
            If photos without GPS land in the wrong place, the camera clock was off. Auto measures
            it from photos that have both GPS and a time.
          </p>
        </div>
      )}
    </section>
  );
}

function PhotoTile({
  photo,
  onShow,
  onRemove,
}: {
  photo: PlacedPhoto;
  onShow(): void;
  onRemove(): void;
}) {
  const { item, placement } = photo;
  const status =
    item.status === 'reading'
      ? { label: '…', title: 'Reading', tone: 'bg-slate-700' }
      : item.status === 'error'
        ? { label: '!', title: item.error ?? 'Could not read this image', tone: 'bg-red-600' }
        : !placement
          ? { label: '·', title: 'Load an activity to place this photo', tone: 'bg-slate-700' }
          : placement.method === 'gps'
            ? {
                label: 'GPS',
                title: `Placed by GPS, ${Math.round(placement.offRouteM)} m from the route`,
                tone: 'bg-emerald-600',
              }
            : placement.method === 'time'
              ? { label: 'time', title: 'Placed by the time it was taken', tone: 'bg-sky-600' }
              : {
                  label: '?',
                  title: {
                    'no-metadata': 'No GPS or time in this photo, so it cannot be placed',
                    'off-route': 'Taken more than 1 km from the route',
                    'outside-activity': 'Taken outside the activity (check the camera clock)',
                    privacy: 'Taken inside the privacy zone, so it is not shown',
                  }[placement.reason],
                  tone: 'bg-amber-600',
                };

  return (
    <li className="group relative aspect-square overflow-hidden rounded-md bg-slate-800">
      <button
        type="button"
        onClick={onShow}
        disabled={!placement || placement.method === 'none'}
        title={`${item.name}: ${status.title}`}
        className="h-full w-full focus-visible:outline-2 focus-visible:outline-orange-300 disabled:cursor-default"
      >
        <BitmapImage bitmap={item.thumb} />
        <span
          className={`absolute bottom-1 left-1 rounded px-1 text-[10px] font-semibold text-white ${status.tone}`}
        >
          {status.label}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="absolute top-0.5 right-0.5 hidden h-5 w-5 rounded-full bg-slate-950/80 text-xs text-white group-focus-within:block group-hover:block"
      >
        ×
      </button>
    </li>
  );
}

/** Draws an ImageBitmap thumbnail, cover-fitted. */
function BitmapImage({ bitmap }: { bitmap: ImageBitmap | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!bitmap) return;
    const s = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const w = bitmap.width * s;
    const h = bitmap.height * s;
    ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }, [bitmap]);
  return <canvas ref={ref} width={160} height={160} className="h-full w-full" />;
}
