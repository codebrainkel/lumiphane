import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { isEmailExportConfigured } from '../src/services/emailExport';
import { createApp } from './app';

dotenv.config();

// A failed request must never take the whole server down.
process.on('unhandledRejection', (reason) => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`Unhandled promise rejection: ${detail.replace(/re_[A-Za-z0-9_-]+/g, 're_redacted')}`);
});
process.on('uncaughtException', (err) => {
  console.error(`Uncaught exception: ${(err.stack || err.message).replace(/re_[A-Za-z0-9_-]+/g, 're_redacted')}`);
});

const app = createApp();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const indexHtml = path.join(dist, 'index.html');
const notFoundHtml = path.join(dist, '404.html');

// Vite fingerprints /assets/*, so those files can be cached for a year.
// index.html, robots.txt, and the sitemap stay fresh.
app.use(
  '/assets',
  express.static(path.join(dist, 'assets'), {
    immutable: true,
    maxAge: '1y',
    index: false,
  })
);
app.use(express.static(dist, { maxAge: 0 }));

const APP_ROUTES = new Set(['/', '/index.html']);

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  if (APP_ROUTES.has(req.path)) {
    res.status(200).sendFile(indexHtml, (err) => {
      if (err) next();
    });
    return;
  }
  res.set('X-Robots-Tag', 'noindex');
  res.status(404).sendFile(notFoundHtml, (err) => {
    if (err) next();
  });
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  const ordering = process.env.TREATSTOCK_PRIVATE_KEY?.trim() ? 'on' : 'off';
  const email = isEmailExportConfigured(process.env.RESEND_API_KEY) ? 'on' : 'off';
  console.log(`Lumiphane listening on ${host}:${port} (Treatstock ordering ${ordering}, email export ${email})`);
});
