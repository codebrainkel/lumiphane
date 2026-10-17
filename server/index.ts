import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPrintOrderRouter } from './printOrderRouter';

dotenv.config();

const app = express();
app.use(createPrintOrderRouter());

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) next();
  });
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  const ordering = process.env.TREATSTOCK_PRIVATE_KEY?.trim() ? 'on' : 'off';
  console.log(`Lumiphane listening on ${host}:${port} (Treatstock ordering ${ordering})`);
});
