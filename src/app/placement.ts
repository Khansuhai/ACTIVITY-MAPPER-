import { useMemo } from 'react';
import type { Track } from '../import';
import { estimateClockCorrection, placePhoto, TrackIndex, type Placement } from '../photos/place';
import { photoInstant } from '../photos/time';
import type { PhotoStop } from '../timeline/timeline';
import { inPrivacyZone } from '../track/privacy';
import { createSampler } from '../track/sampler';
import { type PhotoItem, usePhotos } from './photos';

export interface PlacedPhoto {
  item: PhotoItem;
  /** Instant taken, after time zone and clock correction, or null. */
  time: number | null;
  placement: Placement | null;
  /** Point on the route where the flyover stops for it. */
  position: { lon: number; lat: number } | null;
}

export interface PhotoPlacements {
  photos: PlacedPhoto[];
  stops: PhotoStop[];
  /** Suggested clock correction in minutes (from photos with GPS and time), or null. */
  suggestedCorrectionMin: number | null;
}

export interface PrivacyZones {
  zones: readonly { lat: number; lon: number }[];
  radius: number;
}

const NO_PRIVACY: PrivacyZones = { zones: [], radius: 0 };

/**
 * Places every ready photo on the (visible part of the) track; recomputed when photos, track or
 * clock change. Photos taken inside a privacy zone are left out, so they can't reveal home.
 */
export function usePhotoPlacements(
  track: Track | null,
  privacy: PrivacyZones = NO_PRIVACY,
): PhotoPlacements {
  const items = usePhotos((s) => s.items);
  const correctionMin = usePhotos((s) => s.clockCorrectionMin);
  const index = useMemo(() => (track ? new TrackIndex(track.points) : null), [track]);
  const sampler = useMemo(() => (track ? createSampler(track.points) : null), [track]);

  return useMemo(() => {
    const instant = (item: PhotoItem, correctionMs: number) =>
      item.meta
        ? photoInstant(item.meta.localTime, item.meta.utcOffsetMinutes, correctionMs)
        : null;

    const photos: PlacedPhoto[] = items.map((item) => {
      const time = instant(item, correctionMin * 60_000);
      if (!index || !sampler || item.status !== 'ready' || !item.meta) {
        return { item, time, placement: null, position: null };
      }
      const placement: Placement =
        item.meta.gps && inPrivacyZone(privacy.zones, privacy.radius, item.meta.gps)
          ? { method: 'none', reason: 'privacy' }
          : placePhoto(index, { gps: item.meta.gps, time });
      const position =
        placement.method === 'none'
          ? null
          : (({ lon, lat }) => ({ lon, lat }))(sampler.at(placement.distance));
      return { item, time, placement, position };
    });

    // Stops in route order; photos at the same spot in the order they were taken.
    const stops: PhotoStop[] = photos
      .filter((p) => p.placement && p.placement.method !== 'none')
      .map((p) => ({
        id: p.item.id,
        distance: (p.placement as { distance: number }).distance,
        time: p.time ?? 0,
      }))
      .sort((a, b) => a.distance - b.distance || a.time - b.time)
      .map(({ id, distance }) => ({ id, distance }));

    let suggestedCorrectionMin: number | null = null;
    if (index) {
      const ms = estimateClockCorrection(
        index,
        items.filter((i) => i.meta).map((i) => ({ gps: i.meta!.gps, time: instant(i, 0) })),
      );
      suggestedCorrectionMin = ms === null ? null : ms / 60_000;
    }
    return { photos, stops, suggestedCorrectionMin };
  }, [items, correctionMin, index, sampler, privacy]);
}
