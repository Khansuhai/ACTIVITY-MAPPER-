/**
 * Turning photo files into pixels, in the browser.
 *
 * Quality rule: photos are never decoded below the size they are shown at. Memory rule: only the
 * photo on screen and the next one are kept at full size (see PhotoCache); everything else is a
 * small thumbnail.
 */

/** JPEG quality used when a HEIC photo has to be converted (non-Safari browsers). */
const HEIC_JPEG_QUALITY = 0.95;

/**
 * A blob the browser can decode. Safari decodes HEIC natively; elsewhere we convert it once, at
 * full resolution, with libheif in WebAssembly (heic-to, loaded only when needed; it runs in its
 * own Web Worker).
 */
export async function displayableBlob(file: Blob, heif: boolean): Promise<Blob> {
  if (!heif) return file;
  try {
    const native = await createImageBitmap(file);
    native.close();
    return file;
  } catch {
    const { heicTo } = await import('heic-to');
    return heicTo({ blob: file, type: 'image/jpeg', quality: HEIC_JPEG_QUALITY });
  }
}

/** A small, correctly rotated preview for lists and map pins. */
export function makeThumbnail(blob: Blob, height = 192): Promise<ImageBitmap> {
  return createImageBitmap(blob, {
    imageOrientation: 'from-image',
    resizeHeight: height,
    resizeQuality: 'high',
  });
}

/**
 * Decodes a photo, correctly rotated, with its long side no smaller than `minLongSide` (or the
 * photo's own size if that is smaller: we never upscale), and no larger than needed.
 */
export async function decodeForDisplay(blob: Blob, minLongSide: number): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const longSide = Math.max(full.width, full.height);
  if (longSide <= minLongSide * 1.05) return full;
  const k = minLongSide / longSide;
  try {
    return await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * k),
      resizeHeight: Math.round(full.height * k),
      resizeQuality: 'high',
    });
  } finally {
    full.close();
  }
}

/**
 * A very small, blurred copy for the backdrop behind portrait photos. Drawing it enlarged is
 * cheap, unlike blurring a full-size photo every frame.
 */
export function makeBackdrop(bitmap: ImageBitmap): OffscreenCanvas {
  const w = 48;
  const h = Math.max(1, Math.round((48 * bitmap.height) / bitmap.width));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(2px)';
  ctx.drawImage(bitmap, -2, -2, w + 4, h + 4);
  return canvas;
}
