import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {createApp} from './server/app';
import {PUBLIC_APP_ROUTES} from './src/seo/publicRoutes';
import {renderSitemap, sitemapLastmod} from './src/seo/sitemap';

dotenv.config();

function apiMiddleware(): Plugin {
  const app = createApp();
  return {
    name: 'lumiphane-api',
    configureServer(server) {
      server.middlewares.use(app);
    },
  };
}

function sitemapPlugin(): Plugin {
  let outDir = path.resolve(import.meta.dirname, 'dist');
  return {
    name: 'lumiphane-sitemap',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const xml = renderSitemap(PUBLIC_APP_ROUTES, sitemapLastmod());
      const publicFile = path.resolve(import.meta.dirname, 'public/sitemap.xml');
      fs.mkdirSync(path.dirname(publicFile), { recursive: true });
      fs.writeFileSync(publicFile, xml);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), xml);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiMiddleware(), sitemapPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
