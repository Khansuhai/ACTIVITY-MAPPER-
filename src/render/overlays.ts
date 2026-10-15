import type { Frame, Timeline } from '../timeline/timeline';
import type { ElevationProfile, LiveStats } from '../track/live';
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatSpeed,
} from '../ui/format';

/** Everything the overlays need that does not change from frame to frame. */
export interface OverlayModel {
  title: string;
  /** Date · sport · distance. */
  subtitle: string;
  /** End card: up to four big numbers. */
  summary: { label: string; value: string }[];
  live: LiveStats;
  profile: ElevationProfile | null;
  /** Show pace (min/km) instead of speed. */
  pace: boolean;
  /** Burned into the corner of exported videos; the preview shows MapLibre's control instead. */
  attribution: string | null;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const ORANGE = '#f97316';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** How visible each overlay is at a moment of the timeline (0..1). Pure, so it can be tested. */
export function overlayOpacity(frame: Frame, timeline: Timeline, photoOpacity: number) {
  const t = frame.time;
  const { introDuration, mainDuration, duration } = timeline;
  const mainStart = introDuration;
  const outroStart = introDuration + mainDuration;
  const outroHoldStart = duration - Math.min(2.5, timeline.outroDuration / 2);
  return {
    title: 1 - ramp(t, 1.8, 3),
    hud:
      ramp(t, mainStart - 0.8, mainStart) *
      (1 - ramp(t, outroStart, outroStart + 0.8)) *
      (1 - photoOpacity),
    end: ramp(t, outroHoldStart - 0.3, outroHoldStart + 0.5),
  };
}

/**
 * Draws stats, the elevation profile, the title and end cards, and the attribution on top of a
 * frame (map and photo are already drawn). Sizes scale with the frame: the layout works for
 * 16:9, 9:16 and 1:1 at any resolution.
 */
export function drawOverlays(
  ctx: Ctx,
  width: number,
  height: number,
  frame: Frame,
  timeline: Timeline,
  model: OverlayModel,
  photoOpacity: number,
) {
  const k = Math.min(width, height) / 1080;
  const o = overlayOpacity(frame, timeline, photoOpacity);
  ctx.save();
  if (o.hud > 0) {
    drawBottomShade(ctx, width, height, k, o.hud);
    drawLiveStats(ctx, k, frame, model, o.hud);
    if (model.profile) drawProfile(ctx, width, height, k, frame.distance, model.profile, o.hud);
  }
  if (o.title > 0) drawTitle(ctx, width, height, k, model, o.title);
  if (o.end > 0) drawEndCard(ctx, width, height, k, model, o.end);
  if (model.attribution) drawAttribution(ctx, width, height, k, model.attribution);
  ctx.restore();
}

function drawLiveStats(ctx: Ctx, k: number, frame: Frame, model: OverlayModel, alpha: number) {
  const v = model.live.at(frame.distance);
  const cells: [string, string][] = [
    ['Distance', formatDistance(v.distance)],
    ['Time', formatDuration(v.elapsed)],
    model.pace ? ['Pace', formatPace(v.speed)] : ['Speed', formatSpeed(v.speed)],
    ['Elevation', formatElevation(v.ele)],
  ];
  const pad = 22 * k;
  const cellW = 210 * k;
  const cellH = 92 * k;
  const x0 = 36 * k;
  const y0 = 36 * k;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
  roundRect(ctx, x0, y0, cellW * 2 + pad * 2, cellH * 2 + pad * 2, 22 * k);
  ctx.fill();
  cells.forEach(([label, value], i) => {
    const x = x0 + pad + (i % 2) * cellW;
    const y = y0 + pad + Math.floor(i / 2) * cellH;
    ctx.fillStyle = 'rgba(203, 213, 225, 0.9)';
    ctx.font = `600 ${20 * k}px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(label.toUpperCase(), x, y + 6 * k);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${42 * k}px ${FONT}`;
    ctx.fillText(value, x, y + 32 * k);
  });
}

function drawBottomShade(ctx: Ctx, width: number, height: number, k: number, alpha: number) {
  const h = 260 * k;
  const g = ctx.createLinearGradient(0, height - h, 0, height);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, height - h, width, h);
}

function drawProfile(
  ctx: Ctx,
  width: number,
  height: number,
  k: number,
  distance: number,
  p: ElevationProfile,
  alpha: number,
) {
  const left = 36 * k;
  const right = width - 36 * k;
  const bottom = height - 64 * k;
  const top = bottom - 120 * k;
  const range = Math.max(p.max - p.min, 20); // don't exaggerate a flat route
  const x = (d: number) => left + ((right - left) * d) / Math.max(p.length, 1);
  const y = (e: number) => bottom - ((bottom - top) * (e - p.min)) / range;

  const area = () => {
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    for (let i = 0; i < p.distance.length; i++) ctx.lineTo(x(p.distance[i]!), y(p.ele[i]!));
    ctx.lineTo(right, bottom);
    ctx.closePath();
  };

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  area();
  ctx.fill();
  // Travelled part in orange.
  const cx = x(distance);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top - 10 * k, cx - left, bottom - top + 20 * k);
  ctx.clip();
  ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
  area();
  ctx.fill();
  ctx.restore();
  // Cursor.
  const live = interpolate(p, distance);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(cx, bottom);
  ctx.lineTo(cx, y(live));
  ctx.stroke();
  ctx.fillStyle = ORANGE;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.arc(cx, y(live), 8 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTitle(
  ctx: Ctx,
  width: number,
  height: number,
  k: number,
  m: OverlayModel,
  alpha: number,
) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 12 * k;
  const size = fitFont(ctx, m.title, 700, 76 * k, width * 0.88);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillText(m.title, width / 2, height / 2 - 30 * k);
  ctx.font = `500 ${32 * k}px ${FONT}`;
  ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
  ctx.fillText(m.subtitle, width / 2, height / 2 + 44 * k, width * 0.9);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'start';
}

function drawEndCard(
  ctx: Ctx,
  width: number,
  height: number,
  k: number,
  m: OverlayModel,
  alpha: number,
) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = width / 2;
  const cy = height / 2;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${fitFont(ctx, m.title, 700, 48 * k, width * 0.88)}px ${FONT}`;
  ctx.fillText(m.title, cx, cy - 210 * k);
  const colW = Math.min(width * 0.44, 380 * k);
  m.summary.slice(0, 4).forEach(({ label, value }, i) => {
    const x = cx + (i % 2 === 0 ? -colW / 2 : colW / 2);
    const y = cy - 60 * k + Math.floor(i / 2) * 170 * k;
    ctx.fillStyle = ORANGE;
    ctx.font = `800 ${fitFont(ctx, value, 800, 72 * k, colW * 0.95)}px ${FONT}`;
    ctx.fillText(value, x, y);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.95)';
    ctx.font = `600 ${24 * k}px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x, y + 56 * k);
  });
  ctx.textAlign = 'start';
}

function drawAttribution(ctx: Ctx, width: number, height: number, k: number, text: string) {
  const size = Math.max(11, 17 * k);
  ctx.globalAlpha = 1;
  ctx.font = `500 ${size}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const maxWidth = width - 24 * k;
  const w = Math.min(ctx.measureText(text).width, maxWidth);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, width - w - 22 * k, height - size - 18 * k, w + 14 * k, size + 10 * k, 6 * k);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText(text, width - 15 * k, height - 13 * k, maxWidth);
  ctx.textAlign = 'start';
}

/** Largest font size (up to `max`) at which `text` fits in `width`. */
function fitFont(ctx: Ctx, text: string, weight: number, max: number, width: number): number {
  ctx.font = `${weight} ${max}px ${FONT}`;
  const w = ctx.measureText(text).width;
  return w <= width ? max : Math.max(12, Math.floor((max * width) / w));
}

function interpolate(p: ElevationProfile, d: number): number {
  const f = (Math.min(Math.max(d, 0), p.length) / Math.max(p.length, 1)) * (p.distance.length - 1);
  const i = Math.min(Math.floor(f), p.distance.length - 2);
  return p.ele[i]! + (p.ele[i + 1]! - p.ele[i]!) * (f - i);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 0 before `a`, 1 after `b`, smooth in between. */
function ramp(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
