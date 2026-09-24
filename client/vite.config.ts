import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Serve Handlebars from this app instead of jsDelivr. */
function selfHostHandlebars(): Plugin {
  const rel = 'vendor/handlebars.min.js';
  const src = path.resolve('node_modules/handlebars/dist/handlebars.min.js');
  return {
    name: 'self-host-handlebars',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${rel}`) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        fs.createReadStream(src).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: rel,
        source: fs.readFileSync(src),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    selfHostHandlebars(),
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
