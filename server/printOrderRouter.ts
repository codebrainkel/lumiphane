import express from 'express';
import {
  isPrintOrderingConfigured,
  prepareTreatstockCheckout,
  sanitizeModelFilename,
} from '../src/services/printOrder';

const NOT_CONFIGURED =
  'Print ordering is hidden until TREATSTOCK_PRIVATE_KEY is set on the server.';

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function publicClientIp(req: express.Request): string | undefined {
  const forwarded = headerValue(req.headers['x-forwarded-for']).split(',')[0]?.trim();
  const raw = forwarded || req.socket.remoteAddress || '';
  const ip = raw.replace(/^::ffff:/, '');
  if (!ip) return undefined;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return undefined;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return undefined;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return undefined;
  if (!/^[0-9a-f:.]+$/i.test(ip)) return undefined;
  return ip;
}

function defaultCountry(): string | undefined {
  const raw = (process.env.TREATSTOCK_DEFAULT_COUNTRY || 'US').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : undefined;
}

function toBytes(body: unknown): Uint8Array | null {
  if (body instanceof Uint8Array) return body;
  return null;
}

export function createPrintOrderRouter(): express.Router {
  const router = express.Router();

  router.get('/api/print-order/status', (_req, res) => {
    const enabled = isPrintOrderingConfigured(process.env.TREATSTOCK_PRIVATE_KEY);
    res.json({
      enabled,
      provider: enabled ? 'treatstock' : null,
      message: enabled ? 'Treatstock checkout is available.' : NOT_CONFIGURED,
    });
  });

  router.post(
    '/api/print-order',
    express.raw({ type: 'application/octet-stream', limit: '160mb' }),
    async (req, res) => {
      const apiKey = process.env.TREATSTOCK_PRIVATE_KEY;
      if (!isPrintOrderingConfigured(apiKey)) {
        res.status(503).json({ message: NOT_CONFIGURED });
        return;
      }

      const fileBytes = toBytes(req.body);
      if (!fileBytes) {
        res.status(400).json({ message: 'Upload the lithophane as a binary STL.' });
        return;
      }

      const result = await prepareTreatstockCheckout({
        apiKey: apiKey!.trim(),
        fileBytes,
        filename: sanitizeModelFilename(headerValue(req.headers['x-model-filename'])),
        country: defaultCountry(),
        clientIp: publicClientIp(req),
      });

      if (!result.ok) {
        res.status(result.status).json({ message: result.message });
        return;
      }

      res.json({
        checkoutUrl: result.checkoutUrl,
        widgetUrl: result.widgetUrl,
        packId: result.packId,
        material: result.material,
        color: result.color,
        price: result.price,
        expiresInHours: result.expiresInHours,
      });
    }
  );

  router.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.status === 413 || err?.type === 'entity.too.large') {
      res.status(413).json({
        message: 'This lithophane is too large to upload. Lower the quality tier, then order again, or export the STL.',
      });
      return;
    }
    next(err);
  });

  return router;
}
