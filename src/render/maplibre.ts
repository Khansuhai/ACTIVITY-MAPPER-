import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre v6 cannot find its worker inside a bundle by itself; Vite's `?worker&url` emits a
// self-contained worker file and gives us its URL (see docs/DECISIONS.md, D2).
setWorkerUrl(workerUrl);
