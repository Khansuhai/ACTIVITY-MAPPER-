# OpenFlyover

Turn a GPS activity (run, ride, hike, ski) into a cinematic 3D flyover video, entirely in your
browser. Free and open source: no account, no watermark, your files never leave your device.

> Work in progress. Done so far: drop a GPX, TCX, FIT or KML file, plus your photos (JPEG or
> HEIC), to get a smooth 3D flyover over real terrain that stops at each photo where it was taken,
> with live stats and an elevation profile. Export it as an MP4 (16:9, 9:16 or 1:1, up to 4K at
> 60 fps, no watermark), with your own music. Style it with colour themes, speed/heart-rate/
> elevation colouring, activity icons, peak names and highlights, and a privacy zone around home.
> An Android app comes next (see [PROMPT.md](PROMPT.md)).

Video export needs WebCodecs: current Chrome or Edge (desktop or Android), Safari 26+, or Firefox
130+ on desktop. Keep the tab visible while exporting.

## Develop

Requires Node 24 and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests
pnpm lint && pnpm typecheck && pnpm build
pnpm sample:photos  # 24 test photos along the sample hike, in tmp/ (needs uv)
```

Technical choices and their reasons are logged in [docs/DECISIONS.md](docs/DECISIONS.md).

## Map data

- Basemaps: [OpenFreeMap](https://openfreemap.org) © [OpenMapTiles](https://openmaptiles.org),
  data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- Satellite: [Sentinel-2 cloudless 2016](https://s2maps.eu) by EOX IT Services GmbH (contains
  modified Copernicus Sentinel data 2016), CC BY 4.0.
- Terrain: [Mapterhorn](https://mapterhorn.com/attribution) (Copernicus GLO-30 and national
  elevation models).

## License

[MIT](LICENSE). Third-party licences, including the LGPL HEIC decoder, are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
