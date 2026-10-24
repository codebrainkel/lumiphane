import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';
import { LEGAL_PAGE_ROUTES, landingRedirectTarget } from '../publicRoutes';
import { LANDING_PAGES } from './pages';
import { renderLandingPage } from './renderPage';

const LEGAL_PAGES = new Set<string>(LEGAL_PAGE_ROUTES);

function legalPageFile(root: string, route: string): string {
  const slug = route.replace(/^\/|\/$/g, '');
  return path.join(root, 'public', slug, 'index.html');
}

export function landingPagesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = path.resolve(process.cwd(), 'dist');
  const byPath = new Map(LANDING_PAGES.map((page) => [page.path, page]));

  return {
    name: 'lumiphane-landing-pages',
    configResolved(config) {
      root = config.root;
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
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }

        if (LEGAL_PAGES.has(url.pathname)) {
          const file = legalPageFile(root, url.pathname);
          if (!fs.existsSync(file)) {
            next();
            return;
          }
          const html = fs.readFileSync(file, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(req.method === 'HEAD' ? undefined : html);
          return;
        }

        const page = byPath.get(url.pathname);
        if (!page) {
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
