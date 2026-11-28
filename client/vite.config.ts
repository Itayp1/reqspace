/// <reference types="vitest/config" />
import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The dev proxy logs a full stack for every websocket a closing page leaves half-open; it is not actionable.
const logger = createLogger();
const logError = logger.error;
logger.error = (msg, options) => {
  if (/ws proxy (socket )?error/.test(msg) && /ECONNABORTED|ECONNRESET/.test(String(options?.error?.message ?? msg))) return;
  logError(msg, options);
};

// Unique per build: baked into the bundle and written to dist/version.json, which the server announces over the socket.
const BUILD_ID = String(Date.now());

// Shown in Settings > About. Docker builds pass APP_VERSION (the client stage has no root package.json); local builds read it.
const APP_VERSION = process.env.APP_VERSION || (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version; } catch { return 'dev'; }
})();

export default defineConfig({
  customLogger: logger,
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'version-file',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) });
      },
    },
  ],
  // Monaco is a huge lazily-imported module: transform it up front so the first editor does not
  // time out fetching it when the dev server is busy.
  optimizeDeps: { include: ['monaco-editor', '@monaco-editor/react', 'chai', 'lodash', 'crypto-js', 'ajv', 'ajv-draft-04', 'uuid'] },
  server: {
    warmup: { clientFiles: ['./src/components/common/monacoEditorImpl.ts'] },
    proxy: {
      '/api': {
        target: process.env.REQSPACE_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      // The extension package and its version/changelog are served by the API.
      '/extension': {
        target: process.env.REQSPACE_PROXY_TARGET || 'http://localhost:3005',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.REQSPACE_PROXY_TARGET || 'http://localhost:3005',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
