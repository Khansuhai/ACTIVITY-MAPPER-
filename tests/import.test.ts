// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectFormat, ImportError, importActivity } from '../src/import';
import { computeStats } from '../src/track/stats';
import { fixture, SIMPLE } from './helpers';

describe.each([
  { file: 'simple.gpx', source: 'gpx', name: 'Morning Run', sport: 'running', sensors: true },
  { file: 'simple.tcx', source: 'tcx', name: 'Morning Run', sport: 'Running', sensors: true },
  { file: 'simple.fit', source: 'fit', name: null, sport: 'running', sensors: true },
  { file: 'simple.kml', source: 'kml', name: 'Morning Run', sport: null, sensors: false },
])('$file', ({ file, source, name, sport, sensors }) => {
  it('parses metadata and every valid point', async () => {
    const track = await importActivity(fixture(file), file);
    expect(track.source).toBe(source);
    expect(track.name).toBe(name);
    expect(track.sport).toBe(sport);
    expect(track.points).toHaveLength(SIMPLE.pointCount);
  });

  it('keeps position, elevation and time aligned after skipped points', async () => {
    const { points } = await importActivity(fixture(file), file);
    const p = points[3]!;
    expect(p.lat).toBeCloseTo(46.0015, 6);
    expect(p.lon).toBeCloseTo(7, 6);
    expect(p.ele).toBe(106);
    expect(p.time).toBe(SIMPLE.start + 30_000);
    expect(points[0]!.time).toBe(SIMPLE.start);
    expect(points.at(-1)!.time).toBe(SIMPLE.start + 150_000);
  });

  it.runIf(sensors)('reads heart rate, cadence and power per point', async () => {
    const { points } = await importActivity(fixture(file), file);
    expect(points[3]).toMatchObject({ hr: 135, cad: 86, power: 230 });
    expect(points[10]).toMatchObject({ hr: 150, cad: 86, power: 260 });
  });

  it('produces the hand-computed stats', async () => {
    const stats = computeStats((await importActivity(fixture(file), file)).points);
    expect(stats.distance).toBeCloseTo(SIMPLE.distance, 1);
    expect(stats.elapsedTime).toBe(SIMPLE.elapsedTime);
    expect(stats.movingTime).toBe(SIMPLE.movingTime);
    expect(stats.avgSpeed).toBeCloseTo(SIMPLE.distance / SIMPLE.movingTime, 3);
    expect(stats.maxSpeed).toBeCloseTo(SIMPLE.segmentSpeed, 3);
    expect(stats.elevationGain).toBe(SIMPLE.elevationGain);
    expect(stats.elevationLoss).toBe(SIMPLE.elevationLoss);
    expect(stats.minElevation).toBe(SIMPLE.minElevation);
    expect(stats.maxElevation).toBe(SIMPLE.maxElevation);
    expect(stats.startTime).toBe(SIMPLE.start);
  });
});

describe('format-specific details', () => {
  it('reads GPX temperature from Garmin TrackPointExtension', async () => {
    const { points } = await importActivity(fixture('simple.gpx'));
    expect(points[0]!.temp).toBe(18);
  });

  it('reads FIT temperature', async () => {
    const { points } = await importActivity(fixture('simple.fit'));
    expect(points[10]!.temp).toBe(21);
  });

  it('falls back to <rte> for a planned GPX route without times or elevation', async () => {
    const track = await importActivity(fixture('route.gpx'));
    expect(track.name).toBe('Planned route');
    expect(track.points).toHaveLength(10);
    expect(track.points.every((p) => p.time === null && p.ele === null)).toBe(true);
    const stats = computeStats(track.points);
    expect(stats.distance).toBeCloseTo(SIMPLE.distance, 1);
    expect(stats.elapsedTime).toBeNull();
    expect(stats.avgSpeed).toBeNull();
    expect(stats.elevationGain).toBeNull();
  });

  it('reads an untimed KML LineString', async () => {
    const track = await importActivity(fixture('route-linestring.kml'));
    expect(track.name).toBe('Planned route');
    expect(track.points).toHaveLength(10);
    expect(track.points[9]).toMatchObject({ ele: 115, time: null });
  });
});

describe('detectFormat', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('detects formats from content, ignoring a wrong extension', () => {
    expect(detectFormat(new Uint8Array(fixture('simple.fit')), 'ride.gpx')).toBe('fit');
    expect(detectFormat(new Uint8Array(fixture('simple.gpx')), 'ride.fit')).toBe('gpx');
    expect(detectFormat(new Uint8Array(fixture('simple.tcx')), 'x.txt')).toBe('tcx');
    expect(detectFormat(new Uint8Array(fixture('simple.kml')), '')).toBe('kml');
  });

  it('handles a namespace prefix and a byte order mark', () => {
    expect(detectFormat(bytes('﻿<?xml version="1.0"?>\n<g:gpx xmlns:g="x">'))).toBe('gpx');
  });

  it('falls back to the extension, then gives up', () => {
    expect(detectFormat(bytes('garbage'), 'Track.GPX')).toBe('gpx');
    expect(detectFormat(bytes('garbage'), 'notes.txt')).toBeNull();
  });
});

describe('errors', () => {
  const buffer = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

  it('rejects unsupported files', async () => {
    await expect(importActivity(buffer('hello'), 'notes.txt')).rejects.toThrow(ImportError);
  });

  it('rejects malformed XML', async () => {
    await expect(importActivity(buffer('<gpx><trk>'), 'broken.gpx')).rejects.toThrow(
      /not valid XML/,
    );
  });

  it('rejects a file with fewer than two points', async () => {
    const gpx =
      '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>';
    await expect(importActivity(buffer(gpx), 'one.gpx')).rejects.toThrow(/fewer than two/);
  });

  it('rejects a corrupt FIT file', async () => {
    const bad = fixture('simple.fit').slice(0, 30);
    await expect(importActivity(bad, 'bad.fit')).rejects.toThrow(ImportError);
  });
});
