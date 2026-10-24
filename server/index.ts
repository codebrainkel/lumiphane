import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { isEmailExportConfigured } from '../src/services/emailExport';
import { isStripeSecretConfigured } from '../src/services/tip';
import { createApp } from './app';
import { mountStaticSite } from './staticSite';

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
mountStaticSite(app, dist);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  const ordering = process.env.TREATSTOCK_PRIVATE_KEY?.trim() ? 'on' : 'off';
  const email = isEmailExportConfigured(process.env.RESEND_API_KEY) ? 'on' : 'off';
  const tips = isStripeSecretConfigured(process.env.STRIPE_SECRET_KEY) ? 'on' : 'off';
  console.log(`Lumiphane listening on ${host}:${port} (Treatstock ordering ${ordering}, email export ${email}, tips ${tips})`);
});
