# Technical decisions

A running log of important choices and why they were made. Newest at the bottom of each phase.

Format: **Decision** — context, alternatives considered, consequence.

---

## Phase 1: Skeleton and import (October 2026)

### D1. React + Tailwind (not Svelte)

The spec allowed either. React has the larger hiring market and ecosystem (MapLibre wrappers, testing
tools), which matters for a portfolio project. We stay with it for the whole project.

### D2. MapLibre GL JS v6, not v5

The spec named v5, but when Phase 1 started (Oct 2026) the current major was **6.14**. v6 keeps every
feature we need (raster-dem terrain, hillshade, sky, globe). Breaking changes that affect us:

- ESM-only package: use `import * as maplibregl from 'maplibre-gl'` or named imports, not a default
  import.
- WebGL2 is required (WebGL1 removed). Not a real restriction: every browser with WebCodecs (needed
  for Phase 4 export) has WebGL2.
- `GeoJSONSource.setData` lost its second argument and no longer returns `this`.

- Bundlers must call `setWorkerUrl()` once. With Vite that is
  `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'` (see
  `src/render/maplibre.ts`). Without it the build silently ships no worker and tiles never load.
- `map.isStyleLoaded()` stays false while tiles are loading, long after `style.load` fired, so we
  track style readiness with our own flag before adding route layers.
- Useful for Phase 4: v6 exports `setNow()` / `restoreNow()` to freeze MapLibre's animation clock,
  which should help deterministic frame-by-frame rendering.

Starting on v6 avoids a migration later. Reverting to v5 would only touch `src/ui/RouteMap.tsx` and
`src/render/maplibre.ts`.

### D3. TypeScript 6.0, not 7.0

TypeScript 7 (the native Go compiler) is `latest` on npm, but `typescript-eslint` 8.71 supports only
`>=4.8.4 <6.1.0`. We pin `~6.0.x` until typescript-eslint supports 7. TS 6 also turns `strict` on by
default; we still set it explicitly, plus `noUncheckedIndexedAccess`.

### D4. ESLint (not oxlint)

The current `create-vite` template has switched to oxlint, but the spec asks for ESLint + Prettier,
and ESLint has the React Hooks rules we want. Flat config, `typescript-eslint` recommended,
`eslint-config-prettier` to avoid style conflicts.

### D5. Respect pnpm's minimum release age

pnpm 12 refuses packages published less than a day ago (supply-chain protection). Instead of adding
exclusions, we use the newest versions that pass the gate (for example vitest 5.0.4, not 5.0.5).

### D6. One `Track` model, time and elevation are nullable

Every parser outputs `Track { name, sport, source, points: TrackPoint[] }` where a point is
`{ lat, lon, ele, time, hr?, cad?, power?, temp? }`. `ele` and `time` are `number | null`: planned
routes (Komoot, route GPX) often have no timestamps, and some devices drop elevation. Stats that need
time show "–" instead of guessing. `time` is epoch milliseconds (cheap arithmetic, no Date objects in
hot loops).

### D7. Own small XML parsers instead of `@tmcw/togeojson`; `fit-file-parser` for FIT

The spec suggested `@tmcw/togeojson`. Reading its source (v7.1.3) showed it returns per-point data
as **parallel arrays that can drift out of line with the coordinates**:

- GPX: a `<trkpt>` without `<time>` is skipped in `times`, so every later timestamp shifts by one.
- TCX: trackpoints without a GPS fix are dropped from the coordinates, but extension values are
  still indexed by the original position; heart rates are only pushed when present.
- TCX: every `<Lap>` becomes a separate feature.

The flyover timeline and photo matching depend on each point having _its own_ time, so a silent
one-point shift would be a nasty bug. Our own DOM-based parsers (`src/import/{gpx,tcx,kml}.ts`,
about 150 lines total) build one object per point, so fields can't drift. They match elements by
local name in any namespace (`gpxtpx:hr`, `ns3:Watts`, `gx:coord`). This follows the working rule
"don't add a library when a few lines will do". The fixtures include invalid points and HR-only
samples specifically to test alignment.

- `fit-file-parser` 6.2 (MIT) parses Garmin/COROS/Suunto/Polar `.fit` files in the browser (it
  bundles the `buffer` polyfill) and converts semicircles to degrees. Its built-in `FitEncoder` lets
  us generate a FIT test fixture from a script instead of committing someone's real activity. It is
  **lazy-loaded** (`import('./fit')`): its profile tables add ~290 kB that GPX users never need.
- Format detection sniffs content (`.FIT` signature at byte 8, XML root element) and only falls back
  to the file extension, so a misnamed file still works.
- Points at exactly (0, 0) are dropped: several devices write that before the first GPS fix.

### D8. No Turf.js or Zustand yet

The working rules say not to add a library when a few lines of code do. Phase 1 only needs haversine
distance and a bounding box (about 20 lines, fully tested). Phase 1 state is one `Track` in React
state. Turf (along-line interpolation, bearing smoothing) and Zustand (player/timeline state) will
come in Phase 2, when they pay for themselves.

### D9. How the stats are computed

All stats are computed from the points, so they will match what the user sees once track cleaning
(Phase 2+) is applied. Definitions (constants in `src/track/stats.ts`):

- **Distance**: sum of haversine distances, mean Earth radius 6 371 008.8 m (IUGG).
- **Elapsed time**: last timestamp minus first.
- **Moving time**: sum of segment durations where segment speed ≥ 0.3 m/s (≈ 1.1 km/h) and the gap
  is ≤ 5 minutes. We started at 0.5 m/s, but on the sample hike steep switchbacks (Tobler's hiking
  function gives ~0.35 m/s horizontal at 40 % grade) were counted as stopped: 2:41 instead of 3:01.
- **Average speed**: distance ÷ moving time (the convention used by Strava and Garmin Connect).
- **Max speed**: the maximum of a rolling **median of 5 consecutive segment speeds**. One bad GPS
  point creates two absurd segments (out to the spike and back); a 5-wide median ignores both. A
  simple 5-second average does _not_ work: path length through a spike is still huge.
- **Elevation gain/loss**: two steps. (1) Average elevation over ±30 m of _along-track distance_:
  by distance, not point count, so a 12-minute stop full of jittery samples collapses into one
  value. (2) Hysteresis with a 3 m threshold. The 3 m hysteresis alone gave 965 m on the sample hike
  whose true climb is 820 m; with smoothing it gives 819 m. Min/max elevation use raw values.

Device-reported totals (FIT `session` messages) are not used yet. They can disagree with our numbers
because each vendor uses its own smoothing. Showing them side by side is a possible later feature.

### D10. Basemap: OpenFreeMap "Liberty"

No key, no registration, commercial use allowed, no request limits for normal map views. Required
attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". MapLibre's attribution control
shows it from the style's source metadata; we also keep it in `src/basemaps/registry.ts` so the
Phase 4 exporter can burn it into the video. All basemaps live in that registry with their license
notes.

### D11. Parsing runs on the main thread (for now)

A typical 3-hour FIT file (~10 000 points) parses in well under 100 ms. Moving parsing into a Web
Worker (`src/workers/`) is planned once multi-file import or photo EXIF scanning lands, so the UI
stays responsive with large inputs.

### D12. A synthetic sample activity

"Try a sample" loads `public/samples/sample-hike.gpx`, generated by `scripts/make-sample-gpx.ts`
(deterministic PRNG, Tobler's hiking function for speed, correlated GPS drift, altitude noise, a
lunch stop). It is synthetic on purpose: the repo contains nobody's real location history, and
because we know the true answers (820 m climb, 12-minute stop), it doubles as a realism check
for the stats. It caught both problems described in D9.

## Phase 2: 3D terrain and flyover preview (October 2026)

### D13. The camera is smoothed over distance, not over frames

`timeline.at(t)` is a pure function of video time. The chase camera's heading and centre are
precomputed along the route: a heading sampled every few metres from a chord around each point,
unwrapped (so 359° → 1° is +2°, never −358°), then Gaussian-smoothed with σ ≈ length / 40 (150 to
1500 m). The camera centre is smoothed the same way with σ / 5, so GPS noise cannot shake the
picture; the marker itself stays on the raw track.

A frame-by-frame low-pass filter (the usual approach) would make the camera depend on frame rate
and playback history: scrubbing, 30 vs 60 fps, or a slow export would each give a different
camera. Here, preview and export are the same function. "No jitter" is tested, not eyeballed:
on a noisy (±3 m) route with 24 hairpins, bearing changes < 1° per 60 fps frame, turning speed
changes < 0.05° per frame², and the centre's acceleration stays under 0.5 px per frame².

Other timeline choices:

- **Progress by distance, not recorded time**, so a lunch stop does not freeze the video. Speed
  ramps up and down over the first and last 8 % (trapezoidal profile, continuous speed).
- **Zoom from ground speed**: the ground crosses the screen height in ~8 s whatever the route
  length, so a 10 km hike and a 150 km ride feel alike. Clamped to zoom 10–16.5.
- **Default length** 20 s + 2 s per km, at most 2 min (Phase 4 adds the 15 s–3 min target).
- The marker sits 20 % below the screen centre (MapLibre top padding), so the camera shows what
  is ahead.
- The overview zoom is computed in pure code (our own Web Mercator `fitBounds`), so the timeline
  needs no map instance. It depends on the viewport, so export must use the same CSS viewport and
  scale with `pixelRatio` rather than a bigger CSS size.

### D14. Route progress and marker via feature-state, not per-frame data updates

First version: update `line-gradient` and the marker's GeoJSON every frame. Measured on the
target laptop GPU (Intel UHD, ANGLE/D3D11): **10 fps**. Investigation:

| Per frame                             | fps |
| ------------------------------------- | --- |
| camera only                           | 141 |
| + `setPaintProperty('line-gradient')` | 12  |
| + marker `GeoJSONSource.setData`      | 13  |
| + `setFeatureState` on ~5 dots        | 136 |

With 3D terrain, MapLibre draws lines, fills, rasters and hillshade into cached per-tile textures
(render-to-texture). A changed layer or source data invalidates those textures, and re-rendering
all of them costs ~80 ms. Feature-state does not. So:

- the whole route is a **static** faded line (cached once),
- the travelled part is **dense dots** (~1 px apart at the chase zoom, at most 100 000) on a
  circle layer, switched on with feature-state as the marker passes,
- the **marker** is the dot under the current position, shown by feature-state on a second circle
  layer. It stays inside the map canvas, so the Phase 4 exporter captures it for free.

Result: **130 fps** during real playback (median 7 ms, p95 14 ms). `Frame.lineProgress` and
the Mercator line-progress mapping were removed as unused.

### D15. Terrain: Mapterhorn by default, 1.0× exaggeration

- **Mapterhorn** (Copernicus GLO-30 globally, national lidar at up to 0.5 m in e.g. Switzerland,
  every source openly licensed, no key) is sharper than the AWS/Mapzen tiles, which stay in
  `src/basemaps/terrain.ts` as a fallback. Above z12 Mapterhorn only serves high-resolution
  regions; elsewhere tiles return 404 and MapLibre overscales the parent. The map ignores those
  404s instead of logging them.
- Terrain and hillshade use **two DEM sources** with the same tiles, as MapLibre recommends.
- Default **exaggeration 1.0**. At 1.5× a slope behind a descending hiker hid the marker (it sits
  inside the terrain's depth). Users can still raise it to 3×.
- **Known limitation:** at any exaggeration a high ridge between camera and marker can hide the
  marker. The fix is a terrain-aware camera that raises pitch when the sight line is blocked. It
  must sample the DEM itself (decode Terrarium tiles for the route's area), not query the live
  map, so preview and export stay identical. Planned with the Phase 4 exporter.

### D16. Satellite imagery: EOX Sentinel-2 cloudless **2016 only**

The 2016 edition is CC BY 4.0 (commercial use allowed with attribution). Every later edition
(2017–2025) is CC BY-NC-SA 4.0, and the attribution host also changed, so they are excluded.
Esri World Imagery is excluded too: its terms require an ArcGIS account for most uses.

### D17. Playback state in Zustand; the map is driven imperatively

`usePlayer` (Zustand 5, MIT) holds time, playing and exaggeration. The map subscribes outside
React and calls `applyCamera` + `RouteLayers.update` on every time change, so a 60 fps clock
does not re-render the React tree. While playing, a transparent overlay blocks map gestures
(the timeline owns the camera); when paused, the map is freely explorable.

### D18. Phone app (APK) is the final phase

Requested: record an activity on the phone, add full-quality photos and export the video there.
Plan: after Phase 4, wrap the same web app with Capacitor for Android. Background GPS needs a
native background-location plugin (a PWA cannot record reliably with the screen off). Building
the APK needs the Android SDK, which is not installed yet.

## Phase 3: Photos (October 2026)

### D19. Our own HEIF EXIF reader in front of exifr

`exifr` 7.1.3 (MIT, unmaintained since 2022 but still the best option) reads JPEG EXIF well. Its
HEIC reader ignores the `iloc` box's `base_offset`. iPhones write `base_offset = 0`, so their
files work, but libheif-based encoders put the item position there, and exifr then reads garbage
("Malformed EXIF data"). `src/photos/heif.ts` (about 120 lines, ISO/IEC 23008-12) finds the Exif
item through `iinf`/`iloc` correctly and hands exifr only the TIFF block. A HEIC fixture that
uses a base offset tests it. Worth reporting upstream.

We also read `DateTimeOriginal` as a raw string (`reviveValues: false`): letting exifr revive it
into a `Date` would silently apply the browser's time zone.

### D20. Photo time = wall clock − time zone + clock correction

- Time zone: `OffsetTimeOriginal` when the camera wrote it (phones do), otherwise the browser's
  zone at that date.
- **Clock correction** (minutes, the spec's "camera-clock offset") is added to every photo.
- **Auto** suggests a correction: for photos with GPS _and_ time, the recorded time at the
  photo's GPS position minus its timestamp; the median, rounded to the minute. Photos near a
  place the route passes twice are skipped, because the right pass is unknown while the clock is
  off.

### D21. Placing photos on the route

- **GPS** photos snap to the nearest point of the route (segment projection, not nearest
  vertex). If the route passes within 60 m of that distance more than once (out-and-back,
  loops), the photo's time picks the pass. On the 24-photo sample (an out-and-back hike), every
  photo is within 12 m of its true position, all on the correct pass.
- **No GPS**: placed at the position recorded at the photo's time.
- GPS more than 1 km from the route falls back to time. Photos taken more than 10 minutes
  outside the recording, or with no metadata at all, are listed as unplaced with the reason,
  never guessed.

### D22. Photo stops in the timeline

Each placed photo is a stop. Travel between stops is split into segments with durations
proportional to distance, and every segment brakes and accelerates smoothly (2 s trapezoidal
ramps), so the camera eases into each photo instead of jolting. A stop lasts 4 s by default;
photos at the same spot play back to back in the order taken. `timeline.at(t).photo` gives the
photo id and progress, so preview and export stay one function.

Known trade-off: each photo adds 4 s, so the 10 km sample with 23 photos runs 2:19. Phase 4's
target-length setting will scale travel and stop durations to fit.

### D23. Full-resolution photos without running out of memory

A 48 MP photo takes about 190 MB once decoded, so decoding 20+ of them at once is not an option.

- Lists and map pins use 192 px thumbnails.
- `PhotoCache` keeps at most 3 photos decoded (current, next, previous), each **at no less than
  the size it is shown at** (canvas pixels × 1.12 headroom for the zoom and overscan), never
  upscaled; least recently used ones are closed.
- The next photo starts decoding 3 s before its stop.
- **HEIC**: Safari decodes it natively. Chrome, Edge and Firefox still cannot in 2026, so it is
  converted once with `heic-to` (libheif 1.23 in WebAssembly, in its own Web Worker) to a
  **full-resolution JPEG at quality 0.95**. Decoding HEIC on demand takes 1–2 s per photo, too
  slow for playback. The 0.95 JPEG keeps every pixel and is visually lossless.
- `heic-to` is **LGPL-3.0**. We load it unmodified as a separate on-demand file, so it can be
  replaced, and we credit it in `THIRD-PARTY-NOTICES.md`. `heic2any` was rejected: it is labelled
  MIT but bundles a 2020 LGPL libheif, and it was abandoned in 2023.

### D24. The photo overlay is a 2D canvas with a pure layout

`photoLayout()` (pure, tested) decides where the photo goes at each moment of its stop:

- a smoothstep fade in and out
- a slow 6 % zoom (Ken Burns)
- a small pan whose direction comes from the photo id
- **Photos close to the frame's shape** (within 1.4×, which includes 4:3 phone photos in 16:9)
  fill it with 4 % overscan, so the pan never shows an edge.
- **Other shapes** (portrait in landscape) are shown whole on a blurred, enlarged, darkened copy
  of themselves. The blur is precomputed once at 48 px wide, so drawing it every frame is cheap.

`drawPhoto()` draws onto any 2D context, so the Phase 4 exporter reuses it. Playback stays at
about 139 fps through photo stops. Map attribution stays visible above photos.

### Dependency licenses (Phase 1)

| Package                                    | License      | Use             |
| ------------------------------------------ | ------------ | --------------- |
| react, react-dom                           | MIT          | UI              |
| maplibre-gl                                | BSD-3-Clause | Map rendering   |
| fit-file-parser (+ buffer)                 | MIT          | FIT parsing     |
| vite, @vitejs/plugin-react, vitest         | MIT          | Build and tests |
| tailwindcss, @tailwindcss/vite             | MIT          | Styling         |
| typescript                                 | Apache-2.0   | Language        |
| eslint, typescript-eslint, prettier, jsdom | MIT          | Tooling         |

Looking ahead: **Mediabunny** (Phase 4 MP4 muxing) is **MPL-2.0**. That is file-level copyleft: we
can use it unmodified from an MIT app. If we ever patch its files, those patched files must stay
MPL-2.0 and be published.
