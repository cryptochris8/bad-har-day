/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (Netlify, itch.io, an iframe).
  base: './',
  build: {
    // three r186 ships class static blocks (Safari 16.4+); these targets transpile them for older iOS.
    target: ['safari15', 'chrome100', 'firefox100', 'edge100'],
    // Only index.html is built. dev/*.html module test pages are served by `npm run dev` only.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // three.js in its own chunk: it rarely changes, so returning players keep it cached across releases.
        codeSplitting: { groups: [{ name: 'three', test: /[\/]node_modules[\/]three[\/]/ }] },
      },
    },
  },
  server: { port: 5190 },
  preview: { port: 4190 },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
