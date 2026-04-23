/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'));

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
