import { useEffect, useRef } from 'react';
import { usePlayer } from '../app/player';
import { PhotoCache } from '../photos/cache';
import { drawPhoto } from '../render/drawPhoto';
import { photoLayout, seedFromId } from '../render/photoLayout';
import type { Timeline } from '../timeline/timeline';

interface PhotoOverlayProps {
  timeline: Timeline | null;
  /** Decodable blob for each photo id. */
  blobs: ReadonlyMap<string, Blob>;
}

/** Start decoding a photo this many seconds before its stop. */
const PRELOAD_SECONDS = 3;
/** Headroom for the slow zoom and overscan, so the photo is never upscaled on screen. */
const ZOOM_HEADROOM = 1.12;

/**
 * A 2D canvas over the map that shows the photo at each stop. Drawn from the timeline frame, like
 * the map, so it matches the exported video. Pointer events pass through to the map.
 */
export function PhotoOverlay({ timeline, blobs }: PhotoOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef(blobs);
  const cacheRef = useRef<PhotoCache | null>(null);

  useEffect(() => {
    blobsRef.current = blobs;
  }, [blobs]);

  useEffect(() => {
    const cache = new PhotoCache((id) => blobsRef.current.get(id) ?? null);
    cacheRef.current = cache;
    return () => cache.clear();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const draw = (time: number) => {
      const cache = cacheRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!timeline || !cache) return;
      // Decode at the canvas's real pixel size (CSS size x devicePixelRatio), plus headroom.
      const minLongSide = Math.max(canvas.width, canvas.height) * ZOOM_HEADROOM;

      const upcoming = timeline.at(time + PRELOAD_SECONDS).photo;
      if (upcoming) void cache.load(upcoming.id, minLongSide)?.catch(() => undefined);

      const photo = timeline.at(time).photo;
      if (!photo) return;
      const decoded = cache.peek(photo.id, minLongSide);
      if (!decoded) {
        // Not decoded yet: draw as soon as it is, if we are still on this photo.
        void cache
          .load(photo.id, minLongSide)
          ?.then(() => draw(usePlayer.getState().time))
          .catch(() => undefined);
        return;
      }
      const layout = photoLayout(
        decoded.bitmap.width,
        decoded.bitmap.height,
        canvas.width,
        canvas.height,
        photo.progress,
        seedFromId(photo.id),
      );
      drawPhoto(ctx, decoded, layout);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      draw(usePlayer.getState().time);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const unsubscribe = usePlayer.subscribe((s, prev) => {
      if (s.time !== prev.time) draw(s.time);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [timeline]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
