/// <reference types="vitest/config" />
import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The dev proxy logs a full stack for every websocket a closing page leaves half-open; it is not actionable.
const logger = createLogger();
const logError = logger.error;
logger.error = (msg, options) => {
  if (/ws proxy (socket )?error/.test(msg) && /ECONNABORTED|ECONNRESET/.test(String(options?.error?.message ?? msg))) return;
  logError(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [
    tailwindcss(),
    react()
  ],
  // Monaco is a huge lazily-imported module: transform it up front so the first editor does not
  // time out fetching it when the dev server is busy.
  optimizeDeps: { include: ['monaco-editor', '@monaco-editor/react'] },
  server: {
    warmup: { clientFiles: ['./src/components/common/monacoEditorImpl.ts'] },
    proxy: {
      '/api': {
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
