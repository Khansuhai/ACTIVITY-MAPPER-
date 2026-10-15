import { create } from 'zustand';
import { displayableBlob, makeThumbnail } from '../photos/decode';
import type { PhotoMeta } from '../photos/exif';

export interface PhotoItem {
  id: string;
  name: string;
  file: File;
  status: 'reading' | 'ready' | 'error';
  meta: PhotoMeta | null;
  /** What the browser decodes: the file itself, or a full-size JPEG converted from HEIC. */
  display: Blob | null;
  thumb: ImageBitmap | null;
  error?: string;
  /** Taken while recording: where and when are known exactly (epoch ms), so EXIF is ignored. */
  recorded?: { lat: number; lon: number; time: number };
}

interface PhotosState {
  items: PhotoItem[];
  /** Camera clock correction in minutes, added to every photo's time. */
  clockCorrectionMin: number;
  addFiles(files: File[]): void;
  /** Photos taken in the recorder, pinned to the GPS position and time they were taken. */
  addRecorded(photos: { file: File; lat: number; lon: number; time: number }[]): void;
  remove(id: string): void;
  clear(): void;
  setClockCorrection(minutes: number): void;
}

const PHOTO_EXTENSIONS = /\.(jpe?g|heic|heif|png|webp|avif|tiff?)$/i;

export function isPhotoFile(file: File): boolean {
  return file.type.startsWith('image/') || PHOTO_EXTENSIONS.test(file.name);
}

/** Photos processed at once: decoding is memory-hungry, so keep it modest. */
const CONCURRENCY = 2;

export const usePhotos = create<PhotosState>()((set, get) => {
  const queue: PhotoItem[] = [];
  let running = 0;

  const update = (id: string, patch: Partial<PhotoItem>) =>
    set((s) => ({ items: s.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  async function process(item: PhotoItem) {
    try {
      // exif.ts pulls in exifr (~60 kB): load it with the first photo, not with the app.
      const { readPhotoMeta } = await import('../photos/exif');
      let meta = await readPhotoMeta(await item.file.arrayBuffer());
      if (item.recorded) {
        // Recorded instants are true UTC: store them with a zero offset.
        const { lat, lon, time } = item.recorded;
        meta = { ...meta, gps: { lat, lon }, localTime: time, utcOffsetMinutes: 0 };
      }
      const display = await displayableBlob(item.file, meta.heif);
      const thumb = await makeThumbnail(display);
      if (!get().items.some((p) => p.id === item.id)) {
        thumb.close(); // removed while processing
        return;
      }
      update(item.id, { status: 'ready', meta, display, thumb });
    } catch (e) {
      console.error(`Could not read ${item.name}`, e);
      update(item.id, {
        status: 'error',
        error: e instanceof Error ? e.message : 'This image could not be read.',
      });
    }
  }

  function pump() {
    while (running < CONCURRENCY && queue.length > 0) {
      const item = queue.shift()!;
      running++;
      void process(item).finally(() => {
        running--;
        pump();
      });
    }
  }

  return {
    items: [],
    clockCorrectionMin: 0,
    addFiles(files) {
      const existing = new Set(get().items.map((p) => key(p.file)));
      const added: PhotoItem[] = files
        .filter((f) => isPhotoFile(f) && !existing.has(key(f)))
        .map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          file,
          status: 'reading',
          meta: null,
          display: null,
          thumb: null,
        }));
      if (added.length === 0) return;
      set((s) => ({ items: [...s.items, ...added] }));
      queue.push(...added);
      pump();
    },
    addRecorded(photos) {
      const added: PhotoItem[] = photos.map(({ file, lat, lon, time }) => ({
        id: crypto.randomUUID(),
        name: file.name,
        file,
        status: 'reading',
        meta: null,
        display: null,
        thumb: null,
        recorded: { lat, lon, time },
      }));
      set((s) => ({ items: [...s.items, ...added] }));
      queue.push(...added);
      pump();
    },
    remove(id) {
      const item = get().items.find((p) => p.id === id);
      item?.thumb?.close();
      set((s) => ({ items: s.items.filter((p) => p.id !== id) }));
    },
    clear() {
      for (const p of get().items) p.thumb?.close();
      queue.length = 0;
      set({ items: [] });
    },
    setClockCorrection(minutes) {
      set({ clockCorrectionMin: minutes });
    },
  };
});

/** Same file added twice (e.g. dropped again) is ignored. */
function key(f: File): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

// Debug handle for the browser console during development; stripped from production builds.
if (import.meta.env.DEV) (globalThis as unknown as { __photos?: unknown }).__photos = usePhotos;
