import { useState } from 'react';
import { RecordScreen } from '../ui/RecordScreen';
import { TripsScreen } from '../ui/TripsScreen';
import { App, type OpenedTrip } from './App';
import { useRecording } from './recording';

type Tab = 'studio' | 'record' | 'trips';

const TABS: { id: Tab; label: string }[] = [
  { id: 'record', label: 'Record' },
  { id: 'trips', label: 'My trips' },
  { id: 'studio', label: 'Studio' },
];

/**
 * Top-level navigation: record an activity, browse saved trips, and the video studio. The studio
 * stays mounted while hidden, so switching tabs keeps the loaded activity, photos and settings.
 */
export function Shell() {
  const [tab, setTab] = useState<Tab>('studio');
  const [opened, setOpened] = useState<OpenedTrip | null>(null);
  const recording = useRecording((s) => s.stats !== null && s.stats.state !== 'finished');

  return (
    <div className="flex h-full flex-col">
      <nav
        aria-label="Main"
        className="flex shrink-0 border-b border-slate-800 bg-slate-950 pt-[env(safe-area-inset-top)]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-300 ${
              tab === t.id
                ? 'border-b-2 border-orange-500 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
            {t.id === 'record' && recording && (
              <span className="ml-1.5 text-red-500" aria-label="(recording)">
                ●
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'record' && <RecordScreen onSaved={() => setTab('trips')} />}
        {tab === 'trips' && (
          <TripsScreen
            onOpen={(trip, photos) => {
              setOpened({ trip, photos });
              setTab('studio');
            }}
          />
        )}
        <div className={tab === 'studio' ? 'h-full' : 'hidden'}>
          <App opened={opened} />
        </div>
      </div>
    </div>
  );
}
