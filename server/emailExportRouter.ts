import express from 'express';
import {
  EMAIL_RATE_LIMIT,
  classifyEmailSendError,
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
import { DEFAULT_RESEND_TIMEOUT_MS, createResendHttpSend } from './resendClient';

const NOT_CONFIGURED = 'Email export is hidden until RESEND_API_KEY is set on the server.';
const SEND_FAILED = 'The email could not be sent. Try again, or download the file instead.';
const BUSY = 'Another email is being sent right now. Try again in a moment, or download the file.';

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
) => Promise<EmailSendResult>;

export interface EmailSendResult {
  data: { id: string } | null;
  error: { message: string; statusCode?: number | null; name?: string } | null;
}

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
  /** Hard limit for one Resend call, including the single retry. */
  sendTimeoutMs?: number;
  /** Uploads buffered at once. Each one holds the file plus its base64 copy in memory. */
  maxConcurrentSends?: number;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function bodyBytes(body: unknown): Buffer | null {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return null;
}

function withDeadline(promise: Promise<EmailSendResult>, ms: number): Promise<EmailSendResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<EmailSendResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          data: null,
          error: { name: 'timeout', statusCode: null, message: `send did not finish within ${Math.round(ms / 1000)}s` },
        }),
      ms
    );
  });
  const guarded = promise.catch(
    (err): EmailSendResult => ({
      data: null,
      error: { name: 'network_error', statusCode: null, message: err instanceof Error ? err.message : 'send threw' },
    })
  );
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}

async function sendOnce(
  send: EmailSendFn,
  payload: OutboundExportEmail,
  idempotencyKey: string,
  retryDelayMs: number,
  timeoutMs: number
): Promise<EmailSendResult> {
  const startedAt = Date.now();
  const first = await withDeadline(send(payload, { idempotencyKey }), timeoutMs);
  if (!first.error) return first;
  if (!classifyEmailSendError(first.error).retryable) return first;
  const remaining = timeoutMs - (Date.now() - startedAt) - retryDelayMs;
  if (remaining < 1000) return first;
  if (retryDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return withDeadline(send(payload, { idempotencyKey }), remaining);
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
  const sendTimeoutMs = options.sendTimeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS;
  const maxConcurrent = Math.max(1, options.maxConcurrentSends ?? 1);
  let inFlight = 0;
  let cachedSend: { key: string; send: EmailSendFn } | null = null;

  const senderFor = (apiKey: string): EmailSendFn => {
    if (options.send) return options.send;
    if (!cachedSend || cachedSend.key !== apiKey) {
      cachedSend = { key: apiKey, send: createResendHttpSend(apiKey, { timeoutMs: sendTimeoutMs }) };
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
      if (inFlight >= maxConcurrent) {
        res.setHeader('Retry-After', '10');
        res.status(503).json({ code: 'busy', message: BUSY });
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
      inFlight += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        inFlight -= 1;
      };
      res.once('finish', release);
      res.once('close', release);
      next();
    },
    express.raw({
      type: 'application/octet-stream',
      limit: attachmentLimit,
    }),
    async (req, res) => {
      try {
        await handleSend(req, res);
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        console.error(`Email export crashed before send: ${redactEmailSecrets(detail)}`);
        if (!res.headersSent) res.status(500).json({ code: 'send_failed', message: SEND_FAILED });
      }
    }
  );

  async function handleSend(req: express.Request, res: express.Response): Promise<void> {
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

      const startedAt = Date.now();
      const result = await sendOnce(senderFor(apiKey), payload, idempotencyKey, retryDelayMs, sendTimeoutMs);
      const elapsed = Date.now() - startedAt;
      if (result.error || !result.data) {
        const error = result.error ?? { message: 'no response', statusCode: null };
        const failure = classifyEmailSendError(error);
        console.error(
          `Email export failed code=${failure.code} status=${error.statusCode || 'none'} name=${error.name || 'none'} ` +
            `format=${format} bytes=${bytes.byteLength} ms=${elapsed} reason=${redactEmailSecrets(error.message || 'no response')}`
        );
        if (failure.httpStatus === 429) res.setHeader('Retry-After', '30');
        res.status(failure.httpStatus).json({ code: failure.code, message: failure.message });
        return;
      }
      console.info(`Email export sent id=${result.data.id} format=${format} bytes=${bytes.byteLength} ms=${elapsed}`);
      res.json({ ok: true, id: result.data.id });
  }

  router.use(
    (
      err: { status?: number; type?: string; message?: string },
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!req.path.startsWith('/api/email-export')) {
        next(err);
        return;
      }
      if (res.headersSent) return;
      if (err?.status === 413 || err?.type === 'entity.too.large') {
        res.status(413).json({ code: 'too_large', message: emailTooLargeMessage(attachmentLimit) });
        return;
      }
      if (err?.type === 'request.aborted') {
        console.warn('Email export upload was aborted by the client');
        res.status(400).json({ code: 'aborted', message: 'The upload was interrupted. Try again.' });
        return;
      }
      console.error(`Email export request error: ${redactEmailSecrets(err?.message || err?.type || 'unknown')}`);
      res.status(err?.status && err.status >= 400 && err.status < 500 ? err.status : 500).json({
        code: 'send_failed',
        message: SEND_FAILED,
      });
    }
  );

  return router;
}
