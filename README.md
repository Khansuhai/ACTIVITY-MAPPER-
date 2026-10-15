# OpenFlyover

Turn a GPS activity (run, ride, hike, ski) into a cinematic 3D flyover video, entirely in your
browser. Free and open source: no account, no watermark, your files never leave your device.

> Work in progress. **Phase 1** is done: drop a GPX, TCX, FIT or KML file and see the route on a
> map with its stats. 3D flyover, photos and MP4 export come next (see [PROMPT.md](PROMPT.md)).

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

Basemaps: [OpenFreeMap](https://openfreemap.org) © [OpenMapTiles](https://openmaptiles.org),
data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## License

[MIT](LICENSE)
