# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-10-16

### Added

- Automatic deployment to GitHub Pages after CI passes.
- Keyboard controls: arrow keys seek 5 s (1 s with Shift), Home and End jump.
- An error screen with a reload button instead of a blank page.
- README demo GIF and screenshots, contributing guide, issue and pull-request templates,
  social preview image, `robots.txt` and `llms.txt`.

### Changed

- Faster start-up: style validation is skipped for our trusted map styles (blocking time
  halved).
- Text buttons meet WCAG AA contrast. Lighthouse: accessibility, SEO and best practices 100.

## [0.5.0] - 2026-10-15

### Added

- Privacy zone that hides the route near the start and finish; totals stay correct.
- Colour themes; route colouring by speed, heart rate or elevation.
- Marker icons (runner, bike, hiker, skier, kayak, horse) or your own picture.
- Summit and pass names from OpenStreetMap; highest point and fastest km highlights.
- Music: looped and faded, in the preview and mixed into the MP4 (AAC).
- Terrain-aware camera that tilts so ridges don't hide the marker.

## [0.4.0] - 2026-10-15

### Added

- MP4 export with WebCodecs: 16:9, 9:16, 1:1; 720p to 4K; 30 or 60 fps; 15 s to 3 min.
- Frame-by-frame rendering that waits for the map, so videos are smooth on any computer.
- Live stats, elevation profile, title and end cards, attribution burned into the video.
- Progress with cancel; streaming to a file in Chrome and Edge.

## [0.3.0] - 2026-10-15

### Added

- Photos placed by GPS or capture time, with camera-clock correction and auto-suggestion.
- HEIC support in every browser; full-resolution display with a slow zoom and blurred
  backdrop for portrait photos.
- Photo pins on the map; the flyover stops at each photo.

## [0.2.0] - 2026-10-15

### Added

- 3D terrain, sky and hillshade; satellite, minimal and dark maps.
- Jitter-free chase camera, intro and outro, play, pause and scrub.

## [0.1.0] - 2026-10-15

### Added

- Import GPX, TCX, FIT and KML; distance, time, elevation and speed statistics.
- 2D map of the route; CI with lint, typecheck, tests and build.

[Unreleased]: https://github.com/Khansuhai/ACTIVITY-MAPPER-/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Khansuhai/ACTIVITY-MAPPER-/releases/tag/v0.6.0
