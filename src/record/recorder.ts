import type { TrackPoint } from '../import/types';
import { haversine } from '../track/geo';
import { elevationStats } from '../track/stats';

/** One position reading from the phone (browser Geolocation or the native background service). */
export interface Fix {
  lat: number;
  lon: number;
  /** Metres, or null if the device gave none. */
  ele: number | null;
  /** Epoch ms. */
  time: number;
  /** Horizontal accuracy radius in metres (68 % confidence). */
  accuracy: number;
}

export type RecorderState = 'idle' | 'recording' | 'paused' | 'auto-paused' | 'finished';

/** A photo taken in the app during the activity, pinned to where you were. */
export interface RecordedPhoto {
  id: string;
  time: number;
  lat: number;
  lon: number;
}

export interface RecorderOptions {
  /** Fixes less accurate than this are ignored (metres). */
  maxAccuracy: number;
  /** Faster than this between fixes is a GPS jump, not you (m/s). 70 m/s = 252 km/h. */
  maxSpeed: number;
  /** Skip fixes closer than this to the last kept one (metres), unless `keepEvery` passed. */
  minMove: number;
  /** Keep a fix at least this often even when standing still (ms), for the time axis. */
  keepEvery: number;
  /** Auto-pause after moving less than `pauseRadius` for this long (ms); 0 disables it. */
  autoPauseAfter: number;
  /** Radius (m) you must leave to count as moving again. */
  pauseRadius: number;
}

export const DEFAULT_RECORDER_OPTIONS: RecorderOptions = {
  maxAccuracy: 35,
  maxSpeed: 70,
  minMove: 2.5,
  keepEvery: 10_000,
  autoPauseAfter: 30_000,
  pauseRadius: 20,
};

export interface LiveStats {
  state: RecorderState;
  /** Seconds spent recording, excluding manual and automatic pauses. */
  movingTime: number;
  /** Metres. */
  distance: number;
  /** m/s over the last ~30 s, or null. */
  currentSpeed: number | null;
  /** m/s over the moving time, or null. */
  avgSpeed: number | null;
  ele: number | null;
  elevationGain: number | null;
  /** Accuracy of the latest fix (m), or null before the first. */
  accuracy: number | null;
  points: number;
}

/**
 * Records an activity from a stream of GPS fixes. Pure and deterministic: time comes from the
 * fixes and from the `now` passed to each call, so it can be tested without a phone.
 *
 * Distance is only counted while recording, between kept fixes; a pause (manual or automatic)
 * starts a new segment, so the distance travelled while paused (in a car, on a lift) never
 * counts.
 */
export class Recorder {
  state: RecorderState = 'idle';
  readonly points: TrackPoint[] = [];
  readonly photos: RecordedPhoto[] = [];
  /** Index in `points` where each recording segment starts. */
  readonly segmentStarts: number[] = [];
  private readonly opt: RecorderOptions;
  private distance = 0;
  private movingMs = 0;
  /** When the current recording stretch started (null while paused). */
  private runningSince: number | null = null;
  private lastFix: Fix | null = null;
  private stillSince: { time: number; lat: number; lon: number } | null = null;
  private newSegment = true;

  constructor(options: Partial<RecorderOptions> = {}) {
    this.opt = { ...DEFAULT_RECORDER_OPTIONS, ...options };
  }

  start(now: number) {
    if (this.state !== 'idle') return;
    this.state = 'recording';
    this.runningSince = now;
    this.newSegment = true;
  }

  pause(now: number) {
    if (this.state !== 'recording' && this.state !== 'auto-paused') return;
    this.stopClock(now);
    this.state = 'paused';
  }

  resume(now: number) {
    if (this.state !== 'paused' && this.state !== 'auto-paused') return;
    this.state = 'recording';
    this.runningSince = now;
    this.newSegment = true;
    this.stillSince = null;
  }

  finish(now: number) {
    if (this.state === 'idle' || this.state === 'finished') return;
    this.stopClock(now);
    this.state = 'finished';
  }

  /** Feeds one GPS fix. Returns true if it was kept as a track point. */
  addFix(fix: Fix): boolean {
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;
    if (fix.accuracy > this.opt.maxAccuracy) return false;
    if (this.state === 'auto-paused') this.maybeAutoResume(fix);
    this.lastFix = fix;
    if (this.state !== 'recording') return false;

    const prev = this.points[this.points.length - 1];
    if (prev && !this.newSegment) {
      const d = haversine(prev, fix);
      const dt = (fix.time - (prev.time ?? fix.time)) / 1000;
      if (dt <= 0) return false;
      if (d / dt > this.opt.maxSpeed) return false; // a GPS jump
      this.maybeAutoPause(fix);
      if (this.state !== 'recording') return false;
      if (d < this.opt.minMove && fix.time - (prev.time ?? 0) < this.opt.keepEvery) return false;
      this.distance += d;
    }
    if (this.newSegment) {
      this.segmentStarts.push(this.points.length);
      this.newSegment = false;
      this.stillSince = { time: fix.time, lat: fix.lat, lon: fix.lon };
    }
    this.points.push({ lat: fix.lat, lon: fix.lon, ele: fix.ele, time: fix.time });
    return true;
  }

  /** Pins a photo to the latest position. Returns null before the first fix. */
  addPhoto(id: string, now: number): RecordedPhoto | null {
    const at = this.lastFix;
    if (!at) return null;
    const photo = { id, time: now, lat: at.lat, lon: at.lon };
    this.photos.push(photo);
    return photo;
  }

  stats(now: number): LiveStats {
    const running = this.runningSince !== null ? now - this.runningSince : 0;
    const movingTime = (this.movingMs + running) / 1000;
    const recent = this.recentSpeed();
    const elevation = elevationStats(this.points);
    return {
      state: this.state,
      movingTime,
      distance: this.distance,
      currentSpeed: this.state === 'recording' ? recent : null,
      avgSpeed: movingTime > 0 && this.distance > 0 ? this.distance / movingTime : null,
      ele: this.points.length ? (this.points[this.points.length - 1]!.ele ?? null) : null,
      elevationGain: elevation.elevationGain,
      accuracy: this.lastFix?.accuracy ?? null,
      points: this.points.length,
    };
  }

  private stopClock(now: number) {
    if (this.runningSince !== null) this.movingMs += now - this.runningSince;
    this.runningSince = null;
  }

  /** Standing within `pauseRadius` for `autoPauseAfter` ms pauses the clock automatically. */
  private maybeAutoPause(fix: Fix) {
    if (this.opt.autoPauseAfter <= 0) return;
    const anchor = this.stillSince;
    if (!anchor || haversine(anchor, fix) > this.opt.pauseRadius) {
      this.stillSince = { time: fix.time, lat: fix.lat, lon: fix.lon };
      return;
    }
    if (fix.time - anchor.time >= this.opt.autoPauseAfter) {
      // The clock stopped when you stopped, not 30 s later.
      this.stopClock(anchor.time);
      this.state = 'auto-paused';
    }
  }

  private maybeAutoResume(fix: Fix) {
    const anchor = this.stillSince;
    if (anchor && haversine(anchor, fix) > this.opt.pauseRadius) this.resume(fix.time);
  }

  private recentSpeed(): number | null {
    const pts = this.points;
    const last = pts[pts.length - 1];
    if (!last || last.time === null) return null;
    const segStart = this.segmentStarts[this.segmentStarts.length - 1] ?? 0;
    let d = 0;
    let i = pts.length - 1;
    while (i > segStart && last.time - (pts[i - 1]!.time ?? 0) <= 30_000) {
      d += haversine(pts[i - 1]!, pts[i]!);
      i--;
    }
    const dt = (last.time - (pts[i]!.time ?? last.time)) / 1000;
    return dt > 0 ? d / dt : null;
  }
}
