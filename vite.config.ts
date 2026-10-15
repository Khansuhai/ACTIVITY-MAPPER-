import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works on GitHub Pages sub-paths.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // MapLibre alone is ~1 MB minified (~300 kB gzip) and is needed on first paint.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
