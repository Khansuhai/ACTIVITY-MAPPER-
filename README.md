# OpenFlyover

Turn a GPS activity (run, ride, hike, ski) into a cinematic 3D flyover video, entirely in your
browser. Free and open source: no account, no watermark, your files never leave your device.

> Work in progress. Done so far: drop a GPX, TCX, FIT or KML file to see its stats and a smooth
> 3D flyover over real terrain (play, pause, scrub). Photos, MP4 export and an Android app come
> next (see [PROMPT.md](PROMPT.md)).

## Develop

Requires Node 24 and pnpm.

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit tests
pnpm lint && pnpm typecheck && pnpm build
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

[MIT](LICENSE)
