import { decodeForDisplay, makeBackdrop } from './decode';

export interface DecodedPhoto {
  bitmap: ImageBitmap;
  backdrop: OffscreenCanvas;
}

interface Entry {
  minLongSide: number;
  promise: Promise<DecodedPhoto>;
  value: DecodedPhoto | null;
}

/**
 * Full-size decoded photos, a few at a time. Large phone photos take 50–200 MB each once
 * decoded, so only the most recently used `capacity` stay in memory; older ones are closed.
 */
export class PhotoCache {
  private readonly entries = new Map<string, Entry>();
  private readonly getBlob: (id: string) => Blob | null;
  private readonly capacity: number;

  constructor(getBlob: (id: string) => Blob | null, capacity = 3) {
    this.getBlob = getBlob;
    this.capacity = capacity;
  }

  /** The decoded photo if ready, else null (and starts decoding it). */
  peek(id: string, minLongSide: number): DecodedPhoto | null {
    const entry = this.ensure(id, minLongSide);
    return entry?.value ?? null;
  }

  /** Resolves when the photo is decoded at (at least) `minLongSide`. */
  load(id: string, minLongSide: number): Promise<DecodedPhoto> | null {
    return this.ensure(id, minLongSide)?.promise ?? null;
  }

  /** Frees everything, e.g. when photos are removed or the activity changes. */
  clear() {
    for (const entry of this.entries.values()) {
      void entry.promise.then((d) => d.bitmap.close()).catch(() => undefined);
    }
    this.entries.clear();
  }

  private ensure(id: string, minLongSide: number): Entry | null {
    const existing = this.entries.get(id);
    if (existing && existing.minLongSide >= minLongSide) {
      // Mark as recently used.
      this.entries.delete(id);
      this.entries.set(id, existing);
      return existing;
    }
    const blob = this.getBlob(id);
    if (!blob) return null;
    if (existing) this.evict(id);

    const entry: Entry = {
      minLongSide,
      value: null,
      promise: decodeForDisplay(blob, minLongSide).then((bitmap) => {
        const decoded = { bitmap, backdrop: makeBackdrop(bitmap) };
        if (this.entries.get(id) === entry) entry.value = decoded;
        else bitmap.close(); // evicted while decoding
        return decoded;
      }),
    };
    entry.promise.catch(() => this.entries.delete(id));
    this.entries.set(id, entry);
    while (this.entries.size > this.capacity) this.evict(this.entries.keys().next().value!);
    return entry;
  }

  private evict(id: string) {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    entry?.value?.bitmap.close();
  }
}
