import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { landingRedirectTarget } from '../publicRoutes';
import { LANDING_PAGES } from './pages';
import { renderLandingPage } from './renderPage';

export function landingPagesPlugin(): Plugin {
  let outDir = path.resolve(process.cwd(), 'dist');
  const byPath = new Map(LANDING_PAGES.map((page) => [page.path, page]));

  return {
    name: 'lumiphane-landing-pages',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const redirect = landingRedirectTarget(url.pathname);
        if (redirect) {
          res.statusCode = 301;
          res.setHeader('Location', redirect);
          res.end();
          return;
        }
        const page = byPath.get(url.pathname);
        if (!page || (req.method !== 'GET' && req.method !== 'HEAD')) {
          next();
          return;
        }
        const html = renderLandingPage(page, LANDING_PAGES);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(req.method === 'HEAD' ? undefined : html);
      });
    },
    writeBundle() {
      for (const page of LANDING_PAGES) {
        const slug = page.path.replace(/^\/|\/$/g, '');
        const dir = path.join(outDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), renderLandingPage(page, LANDING_PAGES));
      }
    },
  };
}
