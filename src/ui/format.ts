/** Display formatting (metric). Kept DOM-free so it can be unit tested. */

const DASH = '–';

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 100_000 ? 2 : 1)} km`;
}

/** h:mm:ss, or m:ss under an hour. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return DASH;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatSpeed(metresPerSecond: number | null): string {
  if (metresPerSecond === null) return DASH;
  return `${(metresPerSecond * 3.6).toFixed(1)} km/h`;
}

/** Minutes per kilometre, as runners read it. */
export function formatPace(metresPerSecond: number | null): string {
  if (metresPerSecond === null || metresPerSecond <= 0) return DASH;
  const secondsPerKm = Math.round(1000 / metresPerSecond);
  if (secondsPerKm >= 3600) return DASH; // slower than 60 min/km is not meaningful
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')} /km`;
}

export function formatElevation(metres: number | null): string {
  if (metres === null) return DASH;
  return `${Math.round(metres).toLocaleString('en-US')} m`;
}

export function formatDate(epochMs: number | null): string {
  if (epochMs === null) return '';
  return new Date(epochMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Pace is the natural unit for foot sports, speed for everything else. */
export function prefersPace(sport: string | null): boolean {
  return sport !== null && /run|walk|hik|trail/i.test(sport);
}
