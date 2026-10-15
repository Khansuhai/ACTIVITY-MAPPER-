import { useEffect, useRef } from 'react';
import { usePlayer } from '../app/player';
import { PhotoCache } from '../photos/cache';
import { composeFrame, photoDecodeSize } from '../render/compose';
import type { OverlayModel } from '../render/overlays';
import type { Timeline } from '../timeline/timeline';

interface FrameOverlayProps {
  timeline: Timeline | null;
  /** Decodable blob for each photo id. */
  blobs: ReadonlyMap<string, Blob>;
  model: OverlayModel | null;
}

/** Start decoding a photo this many seconds before its stop. */
const PRELOAD_SECONDS = 3;
/**
 * A 2D canvas over the map with the photo at each stop and the overlays (stats, profile, title
 * and end cards). Drawn with the same composeFrame() as the exporter, so preview and video
 * match. Pointer events pass through to the map.
 */
export function FrameOverlay({ timeline, blobs, model }: FrameOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef(blobs);
  const modelRef = useRef(model);
  const cacheRef = useRef<PhotoCache | null>(null);

  useEffect(() => {
    blobsRef.current = blobs;
    modelRef.current = model;
    // Redraw so overlay text (e.g. a renamed activity) updates while paused.
    canvasRef.current?.dispatchEvent(new Event('redraw'));
  }, [blobs, model]);

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
      const minLongSide = photoDecodeSize(canvas.width, canvas.height);

      const upcoming = timeline.at(time + PRELOAD_SECONDS).photo;
      if (upcoming) void cache.load(upcoming.id, minLongSide)?.catch(() => undefined);

      const frame = timeline.at(time);
      const decoded = frame.photo ? cache.peek(frame.photo.id, minLongSide) : null;
      if (frame.photo && !decoded) {
        // Not decoded yet: redraw as soon as it is, if we are still on this photo.
        void cache
          .load(frame.photo.id, minLongSide)
          ?.then(() => draw(usePlayer.getState().time))
          .catch(() => undefined);
      }
      composeFrame(ctx, canvas.width, canvas.height, frame, timeline, modelRef.current, decoded);
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
    const redraw = () => draw(usePlayer.getState().time);
    canvas.addEventListener('redraw', redraw);
    return () => {
      observer.disconnect();
      unsubscribe();
      canvas.removeEventListener('redraw', redraw);
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
