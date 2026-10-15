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

Starting on v6 avoids a migration later. Reverting to v5 would only touch `src/ui/RouteMap.tsx`.

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

### D7. Parsers: `@tmcw/togeojson` for XML formats, `fit-file-parser` for FIT

- `@tmcw/togeojson` 7.1 (BSD-2-Clause) handles GPX, TCX and KML (`gx:Track`) and exposes per-point
  times and heart rate as `coordinateProperties`. It needs a DOM `Document`: the browser's
  `DOMParser` in the app, jsdom in tests.
- `fit-file-parser` 6.2 (MIT) parses Garmin/COROS/Suunto/Polar `.fit` files in the browser (it
  bundles the `buffer` polyfill) and converts semicircles to degrees. Its built-in `FitEncoder` lets
  us generate a FIT test fixture from a script instead of committing someone's real activity.
- Format detection sniffs content (`.FIT` signature at byte 8, XML root element) and only falls back
  to the file extension, so a misnamed file still works.

### D8. No Turf.js or Zustand yet

The working rules say not to add a library when a few lines of code do. Phase 1 only needs haversine
distance and a bounding box (about 20 lines, fully tested). Phase 1 state is one `Track` in React
state. Turf (along-line interpolation, bearing smoothing) and Zustand (player/timeline state) will
come in Phase 2, when they pay for themselves.

### D9. How the stats are computed

All stats are computed from the points, so they will match what the user sees once track cleaning
(Phase 2+) is applied. Definitions:

- **Distance**: sum of haversine distances, mean Earth radius 6 371 008.8 m (IUGG).
- **Elapsed time**: last timestamp minus first.
- **Moving time**: sum of segment durations where segment speed ≥ 0.5 m/s (1.8 km/h) and the gap is
  ≤ 5 minutes. This excludes stops and auto-pauses.
- **Average speed**: distance ÷ moving time (the convention used by Strava and Garmin Connect).
- **Max speed**: the fastest speed over any window of at least 5 seconds, so a single GPS spike
  (one bad point) cannot produce a 200 km/h max. Phase 2's spike filter will make this even more
  robust.
- **Elevation gain/loss**: hysteresis with a 3 m threshold. Elevation only counts as gained once it
  has risen 3 m above the last low point. Raw GPS altitude noise would otherwise inflate gain by
  20 to 50 %. Barometric data from watches is smoother, so the threshold costs little accuracy there.

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

### Dependency licenses (Phase 1)

| Package                                    | License      | Use                 |
| ------------------------------------------ | ------------ | ------------------- |
| react, react-dom                           | MIT          | UI                  |
| maplibre-gl                                | BSD-3-Clause | Map rendering       |
| @tmcw/togeojson                            | BSD-2-Clause | GPX/TCX/KML parsing |
| fit-file-parser (+ buffer)                 | MIT          | FIT parsing         |
| vite, @vitejs/plugin-react, vitest         | MIT          | Build and tests     |
| tailwindcss, @tailwindcss/vite             | MIT          | Styling             |
| typescript                                 | Apache-2.0   | Language            |
| eslint, typescript-eslint, prettier, jsdom | MIT          | Tooling             |

Looking ahead: **Mediabunny** (Phase 4 MP4 muxing) is **MPL-2.0**. That is file-level copyleft: we
can use it unmodified from an MIT app. If we ever patch its files, those patched files must stay
MPL-2.0 and be published.
