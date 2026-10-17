import express from 'express';
import { Resend } from 'resend';
import {
  EMAIL_RATE_LIMIT,
  EMAIL_RATE_WINDOW_MS,
  buildExportEmail,
  clientAddress,
  createRateLimiter,
  emailTooLargeMessage,
  fileMatchesFormat,
  isEmailExportConfigured,
  isValidRecipientEmail,
  maxEmailAttachmentBytes,
  normalizeIdempotencyKey,
  parseExportFormat,
  redactEmailSecrets,
  resolveEmailFrom,
  sanitizeExportFilename,
} from '../src/services/emailExport';

const NOT_CONFIGURED = 'Email export is hidden until RESEND_API_KEY is set on the server.';
const SEND_FAILED = 'The email could not be sent. Try again, or download the file instead.';

export interface OutboundExportEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
  tags: { name: string; value: string }[];
}

export type EmailSendFn = (
  payload: OutboundExportEmail,
  options: { idempotencyKey: string }
) => Promise<{ data: { id: string } | null; error: { message: string; statusCode?: number | null } | null }>;

export interface EmailExportRouterOptions {
  getApiKey?: () => string | undefined;
  getFrom?: () => string | undefined;
  send?: EmailSendFn;
  now?: () => number;
  maxPerWindow?: number;
  windowMs?: number;
  maxAttachmentBytes?: number;
  retryDelayMs?: number;
  createId?: () => string;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function defaultSend(apiKey: string): EmailSendFn {
  const resend = new Resend(apiKey);
  return async (payload, options) => {
    const result = await resend.emails.send(
      {
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        tags: payload.tags,
        attachments: payload.attachments.map((file) => ({
          filename: file.filename,
          content: file.content,
          contentType: file.contentType,
        })),
      },
      { idempotencyKey: options.idempotencyKey }
    );
    return {
      data: result.data ? { id: result.data.id } : null,
      error: result.error ? { message: result.error.message, statusCode: result.error.statusCode } : null,
    };
  };
}

function bodyBytes(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return null;
}

async function sendOnce(
  send: EmailSendFn,
  payload: OutboundExportEmail,
  idempotencyKey: string,
  retryDelayMs: number
) {
  const first = await send(payload, { idempotencyKey });
  const status = first.error?.statusCode ?? 0;
  if (!first.error || (status !== 429 && status < 500)) return first;
  if (retryDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return send(payload, { idempotencyKey });
}

export function createEmailExportRouter(options: EmailExportRouterOptions = {}): express.Router {
  const router = express.Router();
  const getApiKey = options.getApiKey ?? (() => process.env.RESEND_API_KEY);
  const getFrom = options.getFrom ?? (() => process.env.EMAIL_FROM);
  const attachmentLimit = options.maxAttachmentBytes ?? maxEmailAttachmentBytes();
  const limiter = createRateLimiter({
    max: options.maxPerWindow ?? EMAIL_RATE_LIMIT,
    windowMs: options.windowMs ?? EMAIL_RATE_WINDOW_MS,
    now: options.now,
  });
  const retryDelayMs = options.retryDelayMs ?? 400;
  const createId = options.createId ?? (() => crypto.randomUUID());
  let cachedSend: { key: string; send: EmailSendFn } | null = null;

  const senderFor = (apiKey: string): EmailSendFn => {
    if (options.send) return options.send;
    if (!cachedSend || cachedSend.key !== apiKey) {
      cachedSend = { key: apiKey, send: defaultSend(apiKey) };
    }
    return cachedSend.send;
  };

  router.get('/api/email-export/status', (_req, res) => {
    const enabled = isEmailExportConfigured(getApiKey());
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      enabled,
      message: enabled ? 'Email export is available.' : NOT_CONFIGURED,
    });
  });

  router.post(
    '/api/email-export',
    (req, res, next) => {
      const apiKey = getApiKey();
      if (!isEmailExportConfigured(apiKey)) {
        res.status(503).json({ message: NOT_CONFIGURED });
        return;
      }
      const recipient = headerValue(req.headers['x-recipient-email']).trim();
      if (!isValidRecipientEmail(recipient)) {
        res.status(400).json({ message: 'Enter a valid email address.' });
        return;
      }
      const format = parseExportFormat(headerValue(req.headers['x-export-format']));
      if (!format) {
        res.status(400).json({ message: 'Choose an STL or 3MF file.' });
        return;
      }
      const ip = clientAddress({
        socketAddress: req.socket.remoteAddress,
        forwardedFor: headerValue(req.headers['x-forwarded-for']),
      });
      const decision = limiter.check(ip);
      if (!decision.allowed) {
        res.setHeader('Retry-After', String(decision.retryAfterSeconds));
        res.status(429).json({
          message: 'Too many emails from this network. Wait a few minutes and try again.',
        });
        return;
      }
      next();
    },
    express.raw({
      type: 'application/octet-stream',
      limit: attachmentLimit,
    }),
    async (req, res) => {
      const apiKey = getApiKey()?.trim();
      if (!apiKey || !isEmailExportConfigured(apiKey)) {
        res.status(503).json({ message: NOT_CONFIGURED });
        return;
      }
      const from = resolveEmailFrom(getFrom());
      if (!from.ok) {
        res.status(500).json({ message: 'EMAIL_FROM is not a valid sender address.' });
        return;
      }
      const recipient = headerValue(req.headers['x-recipient-email']).trim();
      const format = parseExportFormat(headerValue(req.headers['x-export-format']));
      if (!isValidRecipientEmail(recipient) || !format) {
        res.status(400).json({ message: 'Choose an STL or 3MF file and a valid email address.' });
        return;
      }
      const bytes = bodyBytes(req.body);
      if (!bytes || bytes.byteLength === 0) {
        res.status(400).json({ message: 'Upload the lithophane as a binary STL or 3MF file.' });
        return;
      }
      if (bytes.byteLength > attachmentLimit) {
        res.status(413).json({ message: emailTooLargeMessage(attachmentLimit) });
        return;
      }
      if (!fileMatchesFormat(bytes, format)) {
        res.status(400).json({
          message: format === 'stl' ? 'The attachment is not a binary STL file.' : 'The attachment is not a 3MF file.',
        });
        return;
      }

      const filename = sanitizeExportFilename(headerValue(req.headers['x-model-filename']), format);
      const message = buildExportEmail({ filename, format, byteLength: bytes.byteLength });
      const idempotencyKey = normalizeIdempotencyKey(headerValue(req.headers['x-idempotency-key']), createId());
      const payload: OutboundExportEmail = {
        from: from.from,
        to: [recipient],
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: [
          {
            filename,
            content: bytes,
            contentType: format === 'stl' ? 'model/stl' : 'model/3mf',
          },
        ],
        tags: [
          { name: 'email_type', value: 'lithophane-export' },
          { name: 'file_format', value: format },
        ],
      };

      try {
        const result = await sendOnce(senderFor(apiKey), payload, idempotencyKey, retryDelayMs);
        if (result.error || !result.data) {
          const status = result.error?.statusCode ?? 0;
          console.error(
            `Email export failed status=${status || 'unknown'} ${redactEmailSecrets(result.error?.message || 'no response')}`
          );
          const clientMessage =
            status === 429
              ? 'The email service is busy. Wait a moment and try again, or download the file.'
              : status === 401 || status === 403
                ? 'Email could not be sent. Check the server email configuration.'
                : SEND_FAILED;
          res.status(status === 429 ? 429 : 502).json({ message: clientMessage });
          return;
        }
        console.info(`Email export sent id=${result.data.id} format=${format} bytes=${bytes.byteLength}`);
        res.json({ ok: true, id: result.data.id });
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        console.error(`Email export failed ${redactEmailSecrets(detail)}`);
        res.status(502).json({ message: SEND_FAILED });
      }
    }
  );

  router.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.status === 413 || err?.type === 'entity.too.large') {
      res.status(413).json({ message: emailTooLargeMessage(attachmentLimit) });
      return;
    }
    next(err);
  });

  return router;
}
