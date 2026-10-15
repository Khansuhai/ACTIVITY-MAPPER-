import { useEffect, useState } from 'react';
import { useRecording } from '../app/recording';
import { isNativeApp } from '../record/platform';
import { SPORTS } from '../record/trip';
import { loadDraft, saveTrip } from '../record/tripStore';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  prefersPace,
} from './format';

const SPORT_NAMES: Record<string, string> = {
  running: 'Run',
  cycling: 'Ride',
  hiking: 'Hike',
  walking: 'Walk',
  skiing: 'Ski',
  kayaking: 'Paddle',
  riding: 'Horse ride',
};

const big =
  'rounded-2xl px-6 py-4 text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** Phone-first screen for recording an activity: big numbers, big buttons. */
export function RecordScreen({ onSaved }: { onSaved(): void }) {
  const rec = useRecording();
  const state = rec.stats?.state ?? 'idle';
  const recording = rec.stats !== null && state !== 'finished';
  const pace = prefersPace(rec.sport);

  // A recording left unfinished by a crash or a killed app: offer to save it.
  useEffect(() => {
    if (recording || rec.finished) return;
    void loadDraft().then((draft) => {
      if (draft && draft.trip.points.length > 1) rec.recoverDraft(draft);
    });
    // Only on first show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rec.finished) return <SaveTrip onSaved={onSaved} />;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col gap-6 p-5">
      {!recording ? (
        <>
          <h2 className="text-2xl font-bold">Record an activity</h2>
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-2 text-sm text-slate-400">Sport</legend>
            {SPORTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={rec.sport === s}
                onClick={() => rec.setSport(s)}
                className={`rounded-xl border px-3 py-3 font-semibold ${
                  rec.sport === s
                    ? 'border-orange-400 bg-orange-700 text-white'
                    : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {SPORT_NAMES[s]}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() => void rec.start()}
            className={`${big} bg-orange-700 text-white hover:bg-orange-600`}
          >
            Start
          </button>
          <p className="text-sm text-slate-400">
            {isNativeApp()
              ? 'Recording continues with the screen off; a notification shows while it runs. Take photos with the camera button: each is pinned to where you are.'
              : 'In a browser, keep the screen on and this tab open while recording (browsers stop GPS in the background). The Android app records with the screen off.'}
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span
              className={`rounded-full px-3 py-1 font-semibold ${
                state === 'recording' ? 'bg-emerald-700 text-white' : 'bg-amber-600 text-white'
              }`}
              role="status"
            >
              {state === 'recording'
                ? '● Recording'
                : state === 'auto-paused'
                  ? 'Auto-paused'
                  : 'Paused'}
            </span>
            <span className="text-slate-400">
              GPS{' '}
              {rec.stats?.accuracy != null ? `±${Math.round(rec.stats.accuracy)} m` : 'searching…'}
            </span>
          </div>

          <div className="text-center">
            <div className="text-6xl font-extrabold tabular-nums">
              {formatDuration(rec.stats?.movingTime ?? 0)}
            </div>
            <div className="text-sm tracking-wide text-slate-400 uppercase">Moving time</div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-center">
            <Stat label="Distance" value={formatDistance(rec.stats?.distance ?? 0)} />
            <Stat
              label={pace ? 'Pace' : 'Speed'}
              value={
                pace
                  ? formatPace(rec.stats?.currentSpeed ?? null)
                  : formatSpeed(rec.stats?.currentSpeed ?? null)
              }
            />
            <Stat label="Elevation" value={formatElevation(rec.stats?.ele ?? null)} />
            <Stat label="Climb" value={formatElevation(rec.stats?.elevationGain ?? null)} />
          </dl>

          {rec.error && (
            <p
              role="alert"
              className="rounded-md border border-amber-800 bg-amber-950/60 p-3 text-sm text-amber-200"
            >
              {rec.error}
            </p>
          )}

          <div className="mt-auto grid grid-cols-3 gap-3">
            {state === 'recording' ? (
              <button
                type="button"
                onClick={rec.pause}
                className={`${big} bg-slate-700 text-white`}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={rec.resume}
                className={`${big} bg-emerald-700 text-white`}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => void rec.takePhoto()}
              aria-label={`Take a photo (${rec.photoCount} so far)`}
              className={`${big} bg-sky-700 text-white`}
            >
              📷 {rec.photoCount || ''}
            </button>
            <FinishButton onFinish={() => void rec.finish()} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs tracking-wide text-slate-400 uppercase">{label}</dt>
    </div>
  );
}

/** Asks for a second tap, so a pocket tap can't end a 3-hour activity. */
function FinishButton({ onFinish }: { onFinish(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onFinish() : setArmed(true))}
      className={`${big} ${armed ? 'bg-red-600' : 'bg-red-800'} text-white`}
    >
      {armed ? 'Sure?' : 'Finish'}
    </button>
  );
}

/** Name the activity and save it to "My trips". */
function SaveTrip({ onSaved }: { onSaved(): void }) {
  const rec = useRecording();
  const finished = rec.finished!;
  const [name, setName] = useState(finished.trip.name);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await saveTrip({ ...finished.trip, name: name.trim() || finished.trip.name }, finished.photos);
    rec.clearFinished();
    onSaved();
  };
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <h2 className="text-2xl font-bold">Save your activity</h2>
      <p className="text-slate-300">
        {formatDistance(finished.trip.distance)} · {formatDuration(finished.trip.movingTime)} ·{' '}
        {finished.trip.photos.length} photos
      </p>
      <label className="flex flex-col gap-1 text-sm text-slate-400">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-3 text-lg text-slate-100"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className={`${big} bg-orange-700 text-white`}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Delete this recording? This cannot be undone.')) rec.clearFinished();
        }}
        className="text-sm text-slate-400 underline"
      >
        Discard recording
      </button>
    </div>
  );
}
