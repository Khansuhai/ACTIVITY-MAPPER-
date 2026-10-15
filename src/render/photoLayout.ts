/**
 * Where to draw a photo during its stop, as a pure function of time. Used by the preview overlay
 * and (Phase 4) the video exporter, so both show exactly the same motion.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoLayout {
  /** 0..1, for fading in and out. */
  opacity: number;
  /** Blurred, cover-fitted copy behind photos whose shape differs from the frame; else null. */
  backdrop: Rect | null;
  /** The photo itself. */
  photo: Rect;
}

/** Fraction of the stop spent fading in, and again fading out. */
export const FADE = 0.12;
/** How much the photo slowly zooms in over its stop (Ken Burns). */
export const ZOOM = 0.06;
/**
 * Photos within this aspect-ratio factor of the frame fill it (cropping a little); others get a
 * blurred backdrop. 1.4 lets the usual 4:3 phone photo fill a 16:9 video (1.33x) but keeps a
 * portrait photo in a landscape video (2.4x) whole.
 */
export const FILL_TOLERANCE = 1.4;
/** Extra scale for frame-filling photos so the pan never reveals an edge. */
const OVERSCAN = 1.04;
/** Margin around photos shown on a backdrop, as a fraction of the frame's shorter side. */
export const MARGIN = 0.05;

/**
 * @param progress 0..1 through the photo stop
 * @param seed 0..1, stable per photo: picks the pan direction so consecutive photos vary
 */
export function photoLayout(
  photoW: number,
  photoH: number,
  frameW: number,
  frameH: number,
  progress: number,
  seed = 0.5,
): PhotoLayout {
  const u = Math.min(1, Math.max(0, progress));
  const opacity = photoOpacity(u);
  const zoom = 1 + ZOOM * easeInOutSine(u);
  // Pan a little, left-to-right or right-to-left depending on the seed.
  const dir = seed < 0.5 ? -1 : 1;
  const pan = dir * (easeInOutSine(u) - 0.5) * 0.03;

  const photoAspect = photoW / photoH;
  const frameAspect = frameW / frameH;
  const ratio = Math.max(photoAspect / frameAspect, frameAspect / photoAspect);

  if (ratio <= FILL_TOLERANCE) {
    // Similar shape: fill the frame, cropping a little.
    const base = cover(photoW, photoH, frameW, frameH);
    const photo = transform(base, OVERSCAN * zoom, pan * frameW, frameW, frameH);
    return { opacity, backdrop: null, photo };
  }

  // Different shape (a portrait photo in a landscape video, or the reverse): show it whole on a
  // blurred, enlarged copy of itself instead of stretching or cropping it.
  const margin = MARGIN * Math.min(frameW, frameH);
  const base = contain(photoW, photoH, frameW - 2 * margin, frameH - 2 * margin);
  base.x += margin;
  base.y += margin;
  const zoomed = transform(base, 1 + (zoom - 1) / 2, pan * frameW * 0.5, frameW, frameH);
  const backdrop = transform(cover(photoW, photoH, frameW, frameH), 1.1, 0, frameW, frameH);
  return { opacity, backdrop, photo: zoomed };
}

/** Opacity of a photo at `progress` (0..1) through its stop: fade in, hold, fade out. */
export function photoOpacity(progress: number): number {
  const u = Math.min(1, Math.max(0, progress));
  return smoothstep(Math.min(u / FADE, (1 - u) / FADE, 1));
}

/** Largest rect with the photo's aspect that fits inside w x h, centred. */
export function contain(photoW: number, photoH: number, w: number, h: number): Rect {
  const scale = Math.min(w / photoW, h / photoH);
  return centred(photoW * scale, photoH * scale, w, h);
}

/** Smallest rect with the photo's aspect that covers w x h, centred. */
export function cover(photoW: number, photoH: number, w: number, h: number): Rect {
  const scale = Math.max(w / photoW, h / photoH);
  return centred(photoW * scale, photoH * scale, w, h);
}

/** Stable 0..1 number from a photo id, for photoLayout's seed. */
export function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function centred(w: number, h: number, frameW: number, frameH: number): Rect {
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/** Scale about the frame centre, then shift horizontally. */
function transform(r: Rect, scale: number, dx: number, frameW: number, frameH: number): Rect {
  const cx = frameW / 2;
  const cy = frameH / 2;
  return {
    x: cx + (r.x - cx) * scale + dx,
    y: cy + (r.y - cy) * scale,
    w: r.w * scale,
    h: r.h * scale,
  };
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
