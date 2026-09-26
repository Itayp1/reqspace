import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3005',
        ws: true,
      },
    },
  },
});
