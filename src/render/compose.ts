import type { DecodedPhoto } from '../photos/cache';
import type { Frame, Timeline } from '../timeline/timeline';
import { drawPhoto } from './drawPhoto';
import { drawOverlays, type OverlayModel } from './overlays';
import { photoLayout, photoOpacity, seedFromId } from './photoLayout';

/**
 * Everything drawn on top of the map for one frame: the photo (if the flyover is stopped at one)
 * and the overlays. The preview and the exporter both call this, so they always match.
 *
 * @param photo the decoded photo for `frame.photo`, or null if there is none (or not yet loaded)
 */
export function composeFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  frame: Frame,
  timeline: Timeline,
  model: OverlayModel | null,
  photo: DecodedPhoto | null,
) {
  let fade = 0;
  if (frame.photo && photo) {
    const layout = photoLayout(
      photo.bitmap.width,
      photo.bitmap.height,
      width,
      height,
      frame.photo.progress,
      seedFromId(frame.photo.id),
    );
    drawPhoto(ctx, photo, layout);
    fade = layout.opacity;
  } else if (frame.photo) {
    fade = photoOpacity(frame.photo.progress);
  }
  if (model) drawOverlays(ctx, width, height, frame, timeline, model, fade);
}

/** Photo decode size for a frame of this size: never upscaled during the slow zoom. */
export function photoDecodeSize(width: number, height: number): number {
  return Math.max(width, height) * 1.12;
}
