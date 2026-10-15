import type { Track } from '../import';
import type { TrackStats } from '../track/stats';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
  prefersPace,
} from './format';

interface StatsPanelProps {
  track: Track;
  stats: TrackStats;
  fileName: string;
}

export function StatsPanel({ track, stats, fileName }: StatsPanelProps) {
  const pace = prefersPace(track.sport);
  const items: [label: string, value: string][] = [
    ['Distance', formatDistance(stats.distance)],
    ['Moving time', formatDuration(stats.movingTime)],
    ['Elapsed time', formatDuration(stats.elapsedTime)],
    ['Elevation gain', formatElevation(stats.elevationGain)],
    pace ? ['Avg pace', formatPace(stats.avgSpeed)] : ['Avg speed', formatSpeed(stats.avgSpeed)],
    ['Max speed', formatSpeed(stats.maxSpeed)],
    ['Elevation loss', formatElevation(stats.elevationLoss)],
    ['Highest point', formatElevation(stats.maxElevation)],
  ];

  return (
    <section aria-labelledby="activity-title" className="space-y-4">
      <header>
        <h2 id="activity-title" className="text-lg font-semibold break-words text-white">
          {track.name ?? fileName.replace(/\.[^.]+$/, '')}
        </h2>
        <p className="text-sm text-slate-400">
          {[formatDate(stats.startTime), track.sport && capitalize(track.sport)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-800">
        {items.map(([label, value]) => (
          <div key={label} className="bg-slate-900 px-3 py-2.5">
            <dt className="text-xs tracking-wide text-slate-400 uppercase">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-white tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-slate-400">
        {fileName} · {track.source.toUpperCase()} · {stats.pointCount.toLocaleString('en-US')}{' '}
        points
        {stats.elapsedTime === null && ' · no timestamps, so time and speed are unavailable'}
      </p>
    </section>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
