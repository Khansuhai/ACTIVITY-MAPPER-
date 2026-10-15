# Third-party notices

OpenFlyover is MIT-licensed (see [LICENSE](LICENSE)). It bundles the open-source packages listed
in `package.json`; most are MIT, BSD or Apache-2.0. One is under a copyleft licence and is listed
here with what that means for you.

## heic-to / libheif (LGPL-3.0)

Used to decode iPhone HEIC photos in browsers that cannot (Chrome, Edge, Firefox).

- Package: [heic-to](https://github.com/hoppergee/heic-to) 1.6.x, which compiles
  [libheif](https://github.com/strukturag/libheif) (LGPL-3.0) and libde265 (LGPL-3.0) to
  WebAssembly.
- How it is used: unmodified, as a separate file (`assets/heic-to-*.js`) loaded on demand. It is
  not mixed into OpenFlyover's own code.
- Your rights under the LGPL: you may replace that file with your own build of heic-to/libheif.
  The source code is available from the links above and from npm (`npm pack heic-to`).
- The full licence text is at <https://www.gnu.org/licenses/lgpl-3.0.html>.

## Mediabunny (MPL-2.0)

Used to write MP4 files when exporting a video.

- Package: [mediabunny](https://github.com/Vanilagy/mediabunny) 1.61.x, unmodified, loaded on
  demand when you export.
- The MPL-2.0 is a file-level copyleft: its source files stay under the MPL (source on GitHub and
  npm); OpenFlyover's own code stays MIT. Licence text: <https://mozilla.org/MPL/2.0/>.

## Map and terrain data

Data sources and their required attributions are listed in the README and shown on the map.
