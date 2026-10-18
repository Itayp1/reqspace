/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
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
