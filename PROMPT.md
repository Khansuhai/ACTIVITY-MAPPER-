# Build Prompt: Open-Source 3D Activity Flyover Video App

> Working name: **OpenFlyover** (rename it to whatever you like before Phase 1).
> Paste this file into an empty project folder and tell Claude Code: "Read PROMPT.md and start Phase 1."

---

## 1. What we are building

A free, open-source web app that turns a GPS activity (run, ride, hike, ski) into a **cinematic 3D flyover video**. The video follows the route over real 3D terrain, pops up the user's photos at the exact place they were taken, shows live stats and an elevation profile, and exports as an MP4 to share on Instagram, YouTube, or Strava.

It is inspired by apps like Relive, COROS 3D Flyover, and Strava flyovers. Everything those apps put behind a paywall is free here:
- unlimited photos, at full resolution
- HD and 4K export
- every basemap style
- speed control
- no limit on activity length
- no watermark

### Hard rules (legal and ethical)
- **Build everything from scratch.** Do NOT decompile, scrape, or copy code, UI designs, icons, assets, text, or branding from Relive or any other commercial app. Reimplementing *features* in our own way is fine. Copying their implementation is not.
- Do not use the name "Relive" anywhere in the product or the code.
- Respect every map and terrain provider's license and usage policy. Always show the required attribution, both on the map and in the exported video.
- Privacy first: process the user's GPS files and photos **in the browser**. Never upload them anywhere unless a later, opt-in feature says so.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Safety, good for a portfolio |
| Build | Vite | Fast, simple, static output |
| UI | React + Tailwind CSS (or Svelte; pick one and stay with it) | Common, employable skills |
| Map and 3D | **MapLibre GL JS v5** with `raster-dem` terrain, hillshade, sky/fog, globe | Open source, no token needed |
| Geo maths | Turf.js | Distance, bearing, along-line interpolation |
| GPS parsing | `@tmcw/togeojson` (GPX/TCX/KML), `fit-file-parser` (Garmin .FIT) | Covers the common watch formats |
| Photo metadata | `exifr` (GPS + DateTimeOriginal), `heic2any` (iPhone HEIC) | Placing photos on the route |
| Video encoding | **WebCodecs `VideoEncoder` + Mediabunny** (successor of mp4-muxer) to write MP4 in the browser. Fallback: `ffmpeg.wasm` | No server needed, so hosting is free |
| State | Zustand (or Svelte stores) | Simple |
| Testing | Vitest (unit), Playwright (end-to-end) | CI-friendly |
| Hosting | GitHub Pages or Cloudflare Pages (static) | Free |
| CI | GitHub Actions: lint, typecheck, test, build, deploy | Free for public repos |
| License | MIT | Portfolio-friendly |

Before coding, check the current versions and APIs of these libraries (MapLibre v5, Mediabunny, WebCodecs support). Don't rely on memory.

### Free data sources (verify each license before use, and add attributions)
- **Terrain:** AWS Open Data Terrain Tiles (Terrarium encoding, no key). Optional: MapTiler terrain (free tier, needs a key), Mapterhorn (open global terrain, check its status).
- **Vector basemap:** OpenFreeMap (no key, OSM data, attribution required).
- **Satellite imagery:** EOX Sentinel-2 cloudless (check license; some years are non-commercial only). Esri World Imagery only if its terms allow this use. Make it a selectable option and document the terms.
- **Place names / reverse geocoding:** read labels straight from the vector tiles first. If Nominatim is used, follow its usage policy (max 1 request per second, custom User-Agent, cache results).
- Put all map styles in a `src/basemaps/` registry. Each entry has a name, URL, attribution, license note, and whether it needs a key.

---

## 3. Features

### Core (must have)
1. **Import an activity:** drag and drop GPX, TCX, FIT, or KML. Show a parse summary (distance, time, elevation gain, average and max speed).
2. **Clean up the track:**
   - trim start and end
   - remove GPS spikes (speed-based outlier filter)
   - smooth with a simple filter, keeping the original data
   - **privacy zone:** hide the first and last N metres around home
3. **3D flyover player:**
   - terrain with adjustable exaggeration
   - the route draws itself progressively (traveled part bright, rest faded)
   - an animated marker shows the current position
   - smooth chase camera: pitch about 60°, smoothed bearing so it doesn't jerk on every GPS wiggle (look ahead along the track, spline or low-pass the heading)
   - intro (zoom from overview down to the start) and outro (pull back to show the whole route)
4. **Photos placed on the route:**
   - read GPS from EXIF. If there's no GPS, match by timestamp to the track, with a camera-clock offset setting.
   - put photo pins on the map. When the camera reaches each one, pause and show the photo with a gentle zoom-and-pan effect.
   - **use full-resolution photos in the export.** Never compress them below the output resolution. (This fixes Relive's free-tier quality complaint.)
   - handle portrait photos nicely (blurred background fill, not stretched)
5. **Overlays:**
   - live stats: distance, elapsed time, speed or pace, elevation
   - animated elevation profile with a moving cursor
   - title card with the activity name and date
   - end summary card
6. **Video export:**
   - 16:9, 9:16 (Reels/Shorts), 1:1
   - 720p, 1080p, 4K
   - 30 or 60 fps
   - target length between 15 s and 3 min (sets playback speed)
   - render **frame by frame, based on time, not real time**: set the camera for frame N, wait until the map is fully loaded and idle, capture the canvas, encode. This makes the output smooth whatever the PC speed.
   - progress bar with cancel. Includes map attribution in a corner.
7. **Basemap switcher:** outdoor vector, satellite, dark, minimal, all free.

### Extras (Phase 5+, the "beat Relive" list)
- Activity icons for the moving marker: bike, runner, hiker, skier, kayak, horse, plus custom upload.
- Points of interest: summit and pass names (from OSM `natural=peak`, `mountain_pass` in the vector tiles), "highest point" and "fastest km" highlights.
- Music track: user's own file, mixed into the MP4 with WebCodecs `AudioEncoder`, with fade in and out.
- Theme presets: colors, fonts, line styles. Speed-colored or heart-rate-colored route lines (from FIT/GPX extensions).
- Multi-day trips: combine several files into one video, with day separators.
- Compare mode: two activities on the same route, racing each other as "ghosts".
- Heart rate, cadence, power, and temperature overlays when the file contains them.
- Shareable interactive web player: export a self-contained HTML page or a link with the route encoded (no server).
- Strava import through OAuth. This needs a tiny backend for the token exchange; use a Cloudflare Worker (free tier) and never put the client secret in frontend code.
- Recording on the phone: an installable PWA first, with honest documentation that background GPS in a PWA is limited. Later, a Capacitor Android app for proper background tracking and in-app photos.
- Batch mode CLI (Node + Playwright headless): `openflyover render activity.gpx --photos ./pics --out video.mp4`.
- Internationalization (English first, then more languages).

---

## 4. Architecture

```
src/
  app/            # React shell, routes, layout
  import/         # gpx/tcx/fit/kml parsers -> common Track model
  track/          # cleaning, smoothing, privacy zone, stats, resampling
  photos/         # EXIF read, HEIC convert, place on track, image cache
  camera/         # camera path: position, bearing, pitch, zoom over time t
  timeline/       # master timeline: maps video time -> track time, photo pauses, intro/outro
  render/         # map setup, overlay drawing (canvas 2D on top of map canvas)
  export/         # frame loop, WebCodecs encoder, muxer, audio
  basemaps/       # basemap registry with attribution + license metadata
  ui/             # components
  workers/        # heavy parsing / encoding in Web Workers
tests/
docs/             # MkDocs or plain markdown docs, screenshots, GIF demo
```

Key design ideas:
- **One common `Track` model:** an array of `{lat, lon, ele, time, hr?, cad?, power?, temp?}` plus metadata. Every parser outputs this.
- **The timeline is the single source of truth.** `timeline.at(videoTimeSeconds)` returns the camera state, route progress, active photo (if any), and overlay values. Both the live preview and the exporter call the same function. Then preview and export always match.
- **The overlay compositor** draws stats, the profile, and photos onto a 2D canvas, composited with the map canvas for each export frame.
- Keep pure logic (track, camera, timeline) free of the DOM, so it can be unit tested and reused by the CLI.

---

## 5. Build phases (finish each one, show me, then wait for my "go")

**Phase 1: Skeleton and import**
- Vite + TS + React + Tailwind project, ESLint + Prettier, Vitest, GitHub Actions CI (lint, typecheck, test, build).
- GPX/TCX/FIT parsing into `Track`, with unit tests using small sample files in `tests/fixtures/`.
- 2D MapLibre map showing the route, plus a stats panel.
- ✅ Done when: I can drop a GPX or FIT file and see the route and correct stats. CI is green.

**Phase 2: 3D terrain and flyover preview**
- Terrain (Terrarium), sky, hillshade, basemap switcher with attribution.
- Timeline + chase camera + progressive route line + marker + intro/outro. Play, pause, and scrub controls.
- ✅ Done when: the preview plays smoothly with no camera jitter on a twisty mountain route.

**Phase 3: Photos**
- EXIF GPS and time matching, clock offset, HEIC support, photo pins, pause-and-show animation in the preview.
- ✅ Done when: 20+ photos from a phone show up at the right places at full quality.

**Phase 4: Video export**
- Deterministic frame loop, WebCodecs + MP4 muxing, aspect ratios, resolutions, fps, progress and cancel, attribution burned in.
- Overlays: stats, elevation profile, title and end cards.
- Feature-detect WebCodecs and tell the user which browser to use if it's missing.
- ✅ Done when: a 1080p 60 fps 9:16 MP4 plays on a phone and looks smooth, with sharp photos.

**Phase 5: Extras**
- Activity icons, peak and pass labels, music, color themes, speed and heart-rate colored lines, privacy zone UI.

**Phase 6: Polish and publish**
- Deploy to GitHub Pages or Cloudflare Pages through GitHub Actions.
- README with a demo GIF, features list, screenshots, and a data-sources and attribution table.
- CONTRIBUTING.md, issue templates, MIT LICENSE, CHANGELOG, semantic version tags. Optional Zenodo DOI.
- Lighthouse check, accessibility basics (keyboard controls, contrast).

Later phases (separate repos or packages are fine): Strava import, Cloudflare Worker, PWA and Capacitor recorder, CLI renderer, interactive share player.

---

## 6. Working rules for Claude Code
- Explain the plan for each phase before writing code. Keep commits small with clear messages (Conventional Commits).
- Write tests for parsers, track cleaning, and timeline maths.
- Don't add a library when a few lines of code will do. Check the license of every dependency (prefer MIT, BSD, or Apache).
- Never commit API keys. Use `.env.local` and `.env.example`.
- If something is a browser limitation (WebCodecs support, PWA background GPS), say so honestly and suggest the workaround. Don't fake it.
- Keep a `docs/DECISIONS.md` log of important technical choices and why they were made. It's great for the portfolio and for interviews.
