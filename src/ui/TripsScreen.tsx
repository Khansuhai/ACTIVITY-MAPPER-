import { useEffect, useState } from 'react';
import { shareFile } from '../record/platform';
import { type Trip, tripToGpx } from '../record/trip';
import { deleteTrip, listTrips, renameTrip, tripPhotos } from '../record/tripStore';
import { formatDate, formatDistance, formatDuration } from './format';

/** "My trips": recorded activities on this device. */
export function TripsScreen({
  onOpen,
}: {
  onOpen(trip: Trip, photos: Record<string, Blob>): void;
}) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () =>
    void listTrips()
      .then(setTrips)
      .catch(() => setTrips([]));
  useEffect(reload, []);

  if (trips === null) return <p className="p-5 text-slate-400">Loading…</p>;
  if (trips.length === 0) {
    return (
      <div className="mx-auto max-w-md p-5 text-slate-300">
        <h2 className="mb-2 text-2xl font-bold text-white">My trips</h2>
        No recorded activities yet. Go to Record to start one.
      </div>
    );
  }

  const button =
    'rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50';

  return (
    <div className="mx-auto max-w-md space-y-3 p-5">
      <h2 className="text-2xl font-bold">My trips</h2>
      <ul className="space-y-3">
        {trips.map((t) => (
          <li key={t.id} className="space-y-2 rounded-xl bg-slate-900 p-4">
            <div>
              <h3 className="font-semibold text-white">{t.name}</h3>
              <p className="text-sm text-slate-400">
                {formatDate(t.createdAt)} · {formatDistance(t.distance)} ·{' '}
                {formatDuration(t.movingTime)} · {t.photos.length} photos
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy === t.id}
                onClick={async () => {
                  setBusy(t.id);
                  onOpen(t, await tripPhotos(t.id));
                }}
                className="rounded-md bg-orange-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Make 3D video
              </button>
              <button
                type="button"
                className={button}
                onClick={() =>
                  void shareFile(
                    new Blob([tripToGpx(t)], { type: 'application/gpx+xml' }),
                    `${t.name.replace(/[^\w-]+/g, '-')}.gpx`,
                    t.name,
                  )
                }
              >
                Share GPX
              </button>
              <button
                type="button"
                className={button}
                onClick={async () => {
                  const name = window.prompt('New name', t.name);
                  if (name?.trim()) {
                    await renameTrip(t.id, name.trim());
                    reload();
                  }
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className={button}
                onClick={async () => {
                  if (!window.confirm(`Delete "${t.name}" and its photos? This cannot be undone.`))
                    return;
                  await deleteTrip(t.id);
                  reload();
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
