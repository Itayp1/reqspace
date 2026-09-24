import fs from 'node:fs';
import path from 'node:path';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

let sandboxBundle: Promise<void> | null = null;

/** Classic script for the opaque script iframe. Not part of the app bundle. */
function bundleSandbox(): Promise<void> {
  if (!sandboxBundle) {
    const outDir = path.resolve('.sandbox-dist');
    sandboxBundle = build({
      configFile: false,
      logLevel: 'warn',
      publicDir: false,
      build: {
        lib: {
          entry: path.resolve('src/sandbox/runtime.ts'),
          formats: ['iife'],
          name: 'ReqspaceSandbox',
          fileName: () => 'sandbox-runtime.js',
        },
        outDir,
        emptyOutDir: true,
        cssCodeSplit: false,
      },
    }).then(() => {
      fs.mkdirSync(path.resolve('public/vendor'), { recursive: true });
      fs.copyFileSync(path.join(outDir, 'sandbox-runtime.js'), path.resolve('public/vendor/sandbox-runtime.js'));
    });
  }
  return sandboxBundle;
}

function scriptSandbox(): Plugin {
  return {
    name: 'script-sandbox',
    async buildStart() {
      await bundleSandbox();
    },
    async configureServer() {
      await bundleSandbox();
    },
  };
}

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
    scriptSandbox(),
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
