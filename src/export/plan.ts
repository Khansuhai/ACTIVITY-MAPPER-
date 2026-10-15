import type { Viewport } from '../camera/camera';

/** Export settings the user picks. */
export type Aspect = '16:9' | '9:16' | '1:1';
export type Resolution = '720p' | '1080p' | '4k';
export type Fps = 30 | 60;

export const ASPECTS: readonly Aspect[] = ['16:9', '9:16', '1:1'];
export const RESOLUTIONS: readonly Resolution[] = ['720p', '1080p', '4k'];
export const MIN_LENGTH_S = 15;
export const MAX_LENGTH_S = 180;

const SHORT_SIDE: Record<Resolution, number> = { '720p': 720, '1080p': 1080, '4k': 2160 };

/** Output size in pixels. The resolution names the short side, as phones and YouTube do. */
export function videoSize(
  aspect: Aspect,
  resolution: Resolution,
): { width: number; height: number } {
  const s = SHORT_SIDE[resolution];
  const long = Math.round((s * 16) / 9);
  if (aspect === '16:9') return { width: long, height: s };
  if (aspect === '9:16') return { width: s, height: long };
  return { width: s, height: s };
}

/** CSS size every export renders at; resolution only changes the pixel ratio (sharpness). */
const REFERENCE_SHORT_SIDE = 720;

/**
 * The map is laid out at a 720-px-short-side CSS viewport and rendered at `pixelRatio`, so a 4K
 * export shows the same framing and label sizes as 1080p, just sharper (DECISIONS.md, D25).
 */
export function exportViewport(
  width: number,
  height: number,
): { css: Viewport; pixelRatio: number } {
  const pixelRatio = Math.min(width, height) / REFERENCE_SHORT_SIDE;
  return { css: { width: width / pixelRatio, height: height / pixelRatio }, pixelRatio };
}

/**
 * Bitrate in bits/s: ~0.12 bits per pixel per frame, generous enough for sharp photos (1080p60
 * ≈ 15 Mbit/s, 4K60 ≈ 60 Mbit/s), within limits phones play back smoothly.
 */
export function chooseBitrate(width: number, height: number, fps: number): number {
  const bitrate = width * height * fps * 0.12;
  return Math.round(Math.min(80e6, Math.max(5e6, bitrate)));
}

/** H.264 levels: max macroblocks per second, max frame size in macroblocks, max bitrate (High). */
const AVC_LEVELS: readonly { level: number; mbps: number; fs: number; br: number }[] = [
  { level: 31, mbps: 108_000, fs: 3_600, br: 17_500_000 },
  { level: 32, mbps: 216_000, fs: 5_120, br: 25_000_000 },
  { level: 40, mbps: 245_760, fs: 8_192, br: 25_000_000 },
  { level: 41, mbps: 245_760, fs: 8_192, br: 62_500_000 },
  { level: 42, mbps: 522_240, fs: 8_704, br: 62_500_000 },
  { level: 50, mbps: 589_824, fs: 22_080, br: 168_750_000 },
  { level: 51, mbps: 983_040, fs: 36_864, br: 300_000_000 },
  { level: 52, mbps: 2_073_600, fs: 36_864, br: 300_000_000 },
  { level: 60, mbps: 4_177_920, fs: 139_264, br: 300_000_000 },
];

/**
 * The `avc1.6400xx` codec string (High profile) with the lowest H.264 level that allows this size,
 * frame rate and bitrate. Mediabunny's own choice ignores frame rate (it labels 1080p60 as level
 * 4.0, which only allows ~30 fps); strict phone decoders can reject a mislabelled stream.
 */
export function avcCodecString(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): string {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const maxSideMbs = Math.max(Math.ceil(width / 16), Math.ceil(height / 16));
  const level =
    AVC_LEVELS.find(
      (l) =>
        frameMbs <= l.fs &&
        frameMbs * fps <= l.mbps &&
        bitrate <= l.br &&
        // A frame side may not exceed sqrt(8 * MaxFS) macroblocks.
        maxSideMbs <= Math.sqrt(8 * l.fs),
    ) ?? AVC_LEVELS[AVC_LEVELS.length - 1]!;
  return `avc1.6400${level.level.toString(16).padStart(2, '0')}`;
}

/**
 * Fits the video into a target length by choosing how long the travel and each photo stop take.
 * Photos get 1.5 to 4 s each and at most half of the time (or exactly `photoSeconds` if the user
 * chose a display time); travel gets the rest, at least 5 s. The result can exceed the target
 * when there are very many photos.
 */
export function planDurations(
  targetSeconds: number,
  photoCount: number,
  intro: number,
  outro: number,
  photoSeconds: number | null = null,
): { travelDuration: number; photoDuration: number } {
  const available = Math.max(0, targetSeconds - intro - outro);
  if (photoCount === 0) return { travelDuration: Math.max(5, available), photoDuration: 0 };
  const photoDuration = photoSeconds ?? Math.min(4, Math.max(1.5, (available * 0.5) / photoCount));
  const travelDuration = Math.max(5, available - photoCount * photoDuration);
  return { travelDuration, photoDuration };
}
