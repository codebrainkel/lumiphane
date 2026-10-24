import express from 'express';
import path from 'path';
import { landingRedirectTarget, PUBLIC_APP_ROUTES } from '../src/seo/publicRoutes';

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Page not found</title>
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0b0d11;
      color: #f1f5f9;
      font-family: system-ui, sans-serif;
    }
    main { text-align: center; padding: 24px; }
    h1 { font-size: 1.25rem; font-weight: 650; margin: 0 0 8px; }
    p { margin: 0; color: #94a3b8; }
    a { color: #ffc21a; }
  </style>
</head>
<body>
  <main>
    <h1>Page not found</h1>
    <p><a href="/">Back to Lumiphane</a></p>
  </main>
</body>
</html>
`;

/**
 * Vite emits build files as assets/<name>-<contenthash>.<ext>.
 * The hash is the final hyphen segment and is at least 8 characters.
 */
const HASHED_ASSET = /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)?$/;

export function isHashedAssetFile(filePath: string): boolean {
  return HASHED_ASSET.test(filePath);
}

const APP_ROUTES = new Set<string>(PUBLIC_APP_ROUTES);

function sendNotFound(res: express.Response): void {
  res.status(404);
  res.set('Cache-Control', 'no-store');
  res.type('html');
  res.send(NOT_FOUND_HTML);
}

/**
 * Serve the Vite build, then the SPA shell for known routes only.
 * Static files are registered first so a missing /assets/* file never
 * falls through to index.html.
 */
export function mountStaticSite(app: express.Express, distDir: string): void {
  const indexFile = path.join(distDir, 'index.html');

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const target = landingRedirectTarget(req.path);
    if (!target) {
      next();
      return;
    }
    res.redirect(301, target);
  });

  app.use(
    express.static(distDir, {
      index: 'index.html',
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache');
          return;
        }
        if (isHashedAssetFile(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (req.path.startsWith('/assets/') || !APP_ROUTES.has(req.path)) {
      sendNotFound(res);
      return;
    }

    res.sendFile(
      indexFile,
      { headers: { 'Cache-Control': 'no-cache' } },
      (err) => {
        if (err) next(err);
      }
    );
  });
}
