import express from 'express';
import { clientAddress, createRateLimiter } from '../src/services/emailExport';
import {
  acceptedTipCents,
  isStripeSecretConfigured,
  tipReturnOrigin,
} from '../src/services/tip';
import { createStripeTipClient, type TipCheckoutResult } from './stripeTip';

const UNAVAILABLE = 'Tips are not available right now.';
const AMOUNT = 'Enter a tip from $1 to $200.';
const LIMITED = 'Too many tips from here. Wait a minute and try again.';

const TIP_RATE_LIMIT = 8;
const TIP_RATE_WINDOW_MS = 10 * 60 * 1000;

export interface TipRouterOptions {
  getSecret?: () => string | undefined;
  checkout?: (amountCents: number, origin: string) => Promise<TipCheckoutResult>;
  now?: () => number;
  maxPerWindow?: number;
  windowMs?: number;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function createTipRouter(options: TipRouterOptions = {}): express.Router {
  const getSecret = options.getSecret ?? (() => process.env.STRIPE_SECRET_KEY);
  const checkout =
    options.checkout ??
    createStripeTipClient({
      getSecret: () => getSecret()?.trim() ?? '',
    });
  const limiter = createRateLimiter({
    max: options.maxPerWindow ?? TIP_RATE_LIMIT,
    windowMs: options.windowMs ?? TIP_RATE_WINDOW_MS,
    now: options.now,
  });
  const router = express.Router();

  router.get('/api/tip/status', (_req, res) => {
    res.json({ enabled: isStripeSecretConfigured(getSecret()) });
  });

  router.post('/api/tip', express.json({ limit: '1kb' }), async (req, res) => {
    if (!isStripeSecretConfigured(getSecret())) {
      res.status(503).json({ message: UNAVAILABLE });
      return;
    }

    const amountCents = acceptedTipCents(req.body?.amountCents);
    if (amountCents === null) {
      res.status(400).json({ message: AMOUNT });
      return;
    }

    const ip = clientAddress({
      socketAddress: req.socket.remoteAddress,
      forwardedFor: headerValue(req.headers['x-forwarded-for']),
    });
    const decision = limiter.check(ip);
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({ message: LIMITED });
      return;
    }

    const origin = tipReturnOrigin(headerValue(req.headers.host));
    const result = await checkout(amountCents, origin);
    if (!result.ok) {
      if (result.status === 429) res.setHeader('Retry-After', '30');
      res.status(result.status).json({ message: result.message });
      return;
    }

    res.json({ url: result.url });
  });

  router.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError) {
      res.status(400).json({ message: AMOUNT });
      return;
    }
    if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
      res.status(400).json({ message: AMOUNT });
      return;
    }
    next(err);
  });

  return router;
}
