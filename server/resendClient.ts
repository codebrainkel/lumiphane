import https from 'node:https';
import type { EmailSendFn, OutboundExportEmail } from './emailExportRouter';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
export const DEFAULT_RESEND_TIMEOUT_MS = 45_000;

const PLACEHOLDER = '__LUMIPHANE_ATTACHMENT_';
/** Multiple of 3 so each chunk encodes to base64 without padding in the middle. */
const BASE64_CHUNK_BYTES = 3 * 16 * 1024;

function base64Size(bytes: number): number {
  return bytes <= 0 ? 0 : Math.ceil(bytes / 3) * 4;
}

/**
 * Builds the Resend JSON request body as one Buffer, writing each attachment as
 * base64 in chunks. Passing a Buffer straight to the Resend SDK makes
 * JSON.stringify expand it into {"type":"Buffer","data":[...]} - an array with
 * one number per byte - which used well over 1 GB of memory for a 30 MB file
 * and got the process killed. This keeps the peak near 2.5x the file size.
 */
export function buildResendRequestBody(payload: OutboundExportEmail): Buffer {
  const skeleton = JSON.stringify({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    tags: payload.tags,
    attachments: payload.attachments.map((file, index) => ({
      filename: file.filename,
      content_type: file.contentType,
      content: `${PLACEHOLDER}${index}__`,
    })),
  });

  const parts: (string | Buffer)[] = [];
  let rest = skeleton;
  payload.attachments.forEach((file, index) => {
    const marker = `${PLACEHOLDER}${index}__`;
    const at = rest.indexOf(marker);
    if (at < 0) throw new Error('attachment placeholder missing from request body');
    parts.push(rest.slice(0, at));
    parts.push(file.content);
    rest = rest.slice(at + marker.length);
  });
  parts.push(rest);

  let total = 0;
  for (const part of parts) {
    total += typeof part === 'string' ? Buffer.byteLength(part, 'utf8') : base64Size(part.byteLength);
  }
  const out = Buffer.allocUnsafe(total);
  let offset = 0;
  for (const part of parts) {
    if (typeof part === 'string') {
      offset += out.write(part, offset, 'utf8');
      continue;
    }
    for (let start = 0; start < part.byteLength; start += BASE64_CHUNK_BYTES) {
      const chunk = part.subarray(start, Math.min(part.byteLength, start + BASE64_CHUNK_BYTES));
      offset += out.write(chunk.toString('base64'), offset, 'latin1');
    }
  }
  if (offset !== total) throw new Error('request body size mismatch');
  return out;
}

export interface TransportRequest {
  headers: Record<string, string>;
  body: Buffer;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  text: string;
}

/** Posts the body and resolves with the status and response text. */
export type ResendTransport = (url: string, request: TransportRequest) => Promise<TransportResponse>;

/**
 * node:https writes the Buffer straight to the socket. fetch (undici) copied the
 * whole request body first, adding another ~40 MB per large email.
 */
export const httpsTransport: ResendTransport = (url, request) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { ...request.headers, 'Content-Length': String(request.body.byteLength) },
        signal: request.signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < 64 * 1024) chunks.push(chunk);
          size += chunk.byteLength;
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end(request.body);
  });

export interface ResendHttpOptions {
  transport?: ResendTransport;
  timeoutMs?: number;
  url?: string;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** Sends through Resend's REST API with a hard timeout. Never throws. */
export function createResendHttpSend(apiKey: string, options: ResendHttpOptions = {}): EmailSendFn {
  const transport = options.transport ?? httpsTransport;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RESEND_TIMEOUT_MS;
  const url = options.url ?? RESEND_EMAILS_URL;
  return async (payload, sendOptions) => {
    let body: Buffer;
    try {
      body = buildResendRequestBody(payload);
    } catch (err) {
      return {
        data: null,
        error: { name: 'request_build_failed', statusCode: null, message: err instanceof Error ? err.message : 'unknown' },
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await transport(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': sendOptions.idempotencyKey,
          'User-Agent': 'lumiphane-email-export',
        },
        body,
        signal: controller.signal,
      });
      const raw = response.text;
      let parsed: { id?: unknown; message?: unknown; name?: unknown } | null = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      if (response.status >= 200 && response.status < 300 && parsed && typeof parsed.id === 'string') {
        return { data: { id: parsed.id }, error: null };
      }
      return {
        data: null,
        error: {
          statusCode: response.status,
          name: typeof parsed?.name === 'string' ? parsed.name : undefined,
          message:
            typeof parsed?.message === 'string'
              ? parsed.message
              : `HTTP ${response.status}${raw ? ` ${raw.slice(0, 200)}` : ''}`,
        },
      };
    } catch (err) {
      if (isAbort(err) || controller.signal.aborted) {
        return {
          data: null,
          error: { name: 'timeout', statusCode: null, message: `Resend did not respond within ${Math.round(timeoutMs / 1000)}s` },
        };
      }
      const code = err && typeof err === 'object' && 'code' in err ? ` ${String((err as { code: unknown }).code)}` : '';
      return {
        data: null,
        error: {
          name: 'network_error',
          statusCode: null,
          message: `${err instanceof Error ? err.message : 'request failed'}${code}`,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
