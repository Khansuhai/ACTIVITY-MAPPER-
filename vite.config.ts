import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Development only (`pnpm dev`, never in builds): lets the browser save a file, e.g. an exported
 * demo video, into tmp/captures/ for scripts/make-demo-media.py. Plain file names only.
 */
function devCaptures(): Plugin {
  return {
    name: 'openflyover-dev-captures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !/^[\w-]{1,60}\.(mp4|png|jpg|json)$/.test(name)) {
          res.statusCode = 400;
          res.end('POST a file with ?name=plain-name.mp4|png|jpg|json');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = join(server.config.root, 'tmp', 'captures');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('saved');
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works on GitHub Pages sub-paths.
  base: './',
  plugins: [react(), tailwindcss(), devCaptures()],
  server: {
    // Editing docs or regenerating sample photos must not reload the app (it would kill a running
    // export in the dev server).
    watch: { ignored: ['**/docs/**', '**/tmp/**', '**/*.md'] },
  },
  build: {
    // MapLibre alone is ~1 MB minified (~300 kB gzip) and is needed on first paint. The 3.2 MB
    // heic-to chunk (libheif in WebAssembly) loads only for HEIC photos on non-Safari browsers.
    chunkSizeWarningLimit: 3300,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
