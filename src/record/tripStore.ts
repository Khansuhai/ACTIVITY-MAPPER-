import type { Trip } from './trip';

/**
 * Trips and their photos, stored on this device (IndexedDB). Nothing is uploaded. A recording in
 * progress is also saved as a draft every few seconds, so a crash or a killed app loses at most
 * a few seconds.
 */
const DB_NAME = 'openflyover';
const VERSION = 1;

interface StoredPhoto {
  id: string;
  tripId: string;
  blob: Blob;
}

/** A recording in progress (or not yet named), restored after a crash. */
export interface Draft {
  trip: Trip;
  /** Photos taken so far: id -> image. */
  photos: Record<string, Blob>;
  state: 'recording' | 'paused' | 'auto-paused' | 'finished';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('trips', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('tripId', 'tripId');
      d.createObjectStore('draft');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTrip(trip: Trip, photos: Record<string, Blob>): Promise<void> {
  const tx = (await db()).transaction(['trips', 'photos'], 'readwrite');
  tx.objectStore('trips').put(trip);
  for (const [id, blob] of Object.entries(photos)) {
    tx.objectStore('photos').put({ id, tripId: trip.id, blob } satisfies StoredPhoto);
  }
  await done(tx);
}

/** All trips, newest first. */
export async function listTrips(): Promise<Trip[]> {
  const tx = (await db()).transaction('trips');
  const trips = await request(tx.objectStore('trips').getAll() as IDBRequest<Trip[]>);
  return trips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function tripPhotos(tripId: string): Promise<Record<string, Blob>> {
  const tx = (await db()).transaction('photos');
  const rows = await request(
    tx.objectStore('photos').index('tripId').getAll(tripId) as IDBRequest<StoredPhoto[]>,
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.blob]));
}

export async function renameTrip(id: string, name: string): Promise<void> {
  const tx = (await db()).transaction('trips', 'readwrite');
  const store = tx.objectStore('trips');
  const trip = await request(store.get(id) as IDBRequest<Trip | undefined>);
  if (trip) store.put({ ...trip, name });
  await done(tx);
}

export async function deleteTrip(id: string): Promise<void> {
  const tx = (await db()).transaction(['trips', 'photos'], 'readwrite');
  tx.objectStore('trips').delete(id);
  const photos = tx.objectStore('photos');
  const keys = await request(photos.index('tripId').getAllKeys(id));
  for (const key of keys) photos.delete(key);
  await done(tx);
}

export async function saveDraft(draft: Draft): Promise<void> {
  const tx = (await db()).transaction('draft', 'readwrite');
  tx.objectStore('draft').put(draft, 'current');
  await done(tx);
}

export async function loadDraft(): Promise<Draft | null> {
  const tx = (await db()).transaction('draft');
  return (
    (await request(tx.objectStore('draft').get('current') as IDBRequest<Draft | undefined>)) ?? null
  );
}

export async function clearDraft(): Promise<void> {
  const tx = (await db()).transaction('draft', 'readwrite');
  tx.objectStore('draft').delete('current');
  await done(tx);
}
