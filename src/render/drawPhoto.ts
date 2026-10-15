import type { DecodedPhoto } from '../photos/cache';
import type { PhotoLayout } from './photoLayout';

/**
 * Draws one photo frame onto a 2D canvas: the blurred backdrop (if any) and the photo, with the
 * layout's fade. Used by the preview overlay and (Phase 4) the exporter's compositor.
 */
export function drawPhoto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  photo: DecodedPhoto,
  layout: PhotoLayout,
) {
  ctx.save();
  ctx.globalAlpha = layout.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (layout.backdrop) {
    const { x, y, w, h } = layout.backdrop;
    ctx.drawImage(photo.backdrop, x, y, w, h);
    // Darken the backdrop so the photo stands out.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 24;
  }
  const { x, y, w, h } = layout.photo;
  ctx.drawImage(photo.bitmap, x, y, w, h);
  ctx.restore();
}
