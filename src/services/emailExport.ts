/**
 * Shared rules for emailing an STL or 3MF. This module is safe to import from
 * the browser: it does not read the Resend API key or any other server secret.
 */

import { inspectBinaryStl } from './printOrder';

/** Resend rejects the message once the base64 attachment plus the body exceed this. */
export const RESEND_MAX_TOTAL_BYTES = 40 * 1024 * 1024;

/** Room for headers, HTML, and the plain-text part around the attachment. */
export const EMAIL_ENVELOPE_RESERVE_BYTES = 64 * 1024;

export const EMAIL_RATE_LIMIT = 5;
export const EMAIL_RATE_WINDOW_MS = 15 * 60 * 1000;

export const DEFAULT_EMAIL_FROM = 'Lumiphane <exports@lumiphane.com>';

export type EmailAttachmentFormat = 'stl' | '3mf';
export type DownloadFormat = 'bambu-project' | 'universal' | 'stl';

const PLACEHOLDER_KEYS = new Set([
  're_xxxxxxxxx',
  're_your_api_key',
  'my_resend_api_key',
  'your_resend_api_key',
  'changeme',
  'placeholder',
]);

export function maxEmailAttachmentBytes(
  totalBudget = RESEND_MAX_TOTAL_BYTES,
  reserve = EMAIL_ENVELOPE_RESERVE_BYTES
): number {
  const encodedBudget = Math.max(0, totalBudget - reserve);
  return Math.floor(encodedBudget / 4) * 3;
}

export function base64Length(bytes: number): number {
  if (bytes <= 0) return 0;
  return Math.ceil(bytes / 3) * 4;
}

export function formatByteSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${rounded} MB`;
}

export function emailTooLargeMessage(limit = maxEmailAttachmentBytes()): string {
  return `This file is too large to email (limit ${formatByteSize(limit)} after encoding, about 40 MB total). Download it instead, or lower the quality tier and try again.`;
}

export function isEmailExportConfigured(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 16 || !trimmed.startsWith('re_')) return false;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_KEYS.has(lower)) return false;
  if (lower.includes('your_') || lower.includes('changeme') || lower.includes('placeholder')) return false;
  if (/x{4,}/i.test(trimmed)) return false;
  return true;
}

export function isValidRecipientEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 6 || email.length > 254) return false;
  if (/[\u0000-\u001F\u007F\s]/.test(email)) return false;
  const match = /^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64})@([A-Za-z0-9.-]{1,253})$/.exec(email);
  if (!match) return false;
  const domain = match[2];
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    return false;
  }
  return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]);
}

export function parseExportFormat(value: string | undefined | null): EmailAttachmentFormat | null {
  const format = value?.trim().toLowerCase();
  if (format === 'stl' || format === '3mf') return format;
  return null;
}

/**
 * Email is STL or 3MF. A 3MF email keeps the Bambu Studio project when that
 * card is selected, and otherwise sends a standard 3MF.
 */
export function resolveEmailedFormat(
  emailFormat: EmailAttachmentFormat,
  downloadFormat: DownloadFormat
): DownloadFormat {
  if (emailFormat === 'stl') return 'stl';
  if (downloadFormat === 'bambu-project') return 'bambu-project';
  return 'universal';
}

export function sanitizeExportFilename(name: string | undefined, format: EmailAttachmentFormat): string {
  const ext = format === 'stl' ? '.stl' : '.3mf';
  const base = (name || 'lithophane')
    .replace(/\.(stl|3mf)$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'lithophane'}${ext}`;
}

export function fileMatchesFormat(bytes: Uint8Array, format: EmailAttachmentFormat): boolean {
  if (format === '3mf') {
    return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  return inspectBinaryStl(bytes).ok;
}

export function resolveEmailFrom(raw: string | undefined | null): { ok: true; from: string } | { ok: false } {
  const trimmed = raw?.trim() ?? '';
  const value = trimmed || DEFAULT_EMAIL_FROM;
  const wrapped = /^(?:"[^"\r\n]{1,80}"|[A-Za-z0-9 .'_-]{1,80})\s*<([^<>\s]+)>$/.exec(value);
  const email = (wrapped ? wrapped[1] : value).trim();
  if (!isValidRecipientEmail(email)) return { ok: false };
  return { ok: true, from: wrapped ? value : email };
}

export function normalizeIdempotencyKey(raw: string | undefined | null, fallbackId: string): string {
  const cleaned = (raw || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const id = cleaned.length >= 8 ? cleaned : fallbackId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return `lithophane-export/${id || 'send'}`;
}

export function redactEmailSecrets(text: string): string {
  return text.replace(/re_[A-Za-z0-9_-]+/g, 're_redacted');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ExportEmailContent {
  subject: string;
  html: string;
  text: string;
}

export function buildExportEmail(options: {
  filename: string;
  format: EmailAttachmentFormat;
  byteLength: number;
}): ExportEmailContent {
  const formatLabel = options.format === 'stl' ? 'STL' : '3MF';
  const filename = escapeHtml(options.filename);
  const size = formatByteSize(options.byteLength);
  const subject = `Your Lumiphane ${formatLabel} file`;
  const preheader = `The ${formatLabel} file is attached. Print it standing upright in white PLA.`;
  const text = [
    'Your Lumiphane lithophane is attached',
    '',
    `The file ${options.filename} is attached as a ${formatLabel} model (${size}).`,
    'Open it in your slicer. Print it standing upright in white PLA or white resin with solid (100%) infill so the photo shows when the print is backlit.',
    '',
    'You asked Lumiphane to email this file. If you did not, you can ignore this message.',
    'Lumiphane does not keep a copy of the attachment.',
    '',
    'Lumiphane',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f1ea;">
    <div lang="en" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
    <div lang="en" dir="ltr" style="margin:0;padding:24px 16px;background:#f4f1ea;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
        <tr>
          <td style="padding:28px 28px 8px;border-top:4px solid #b45309;">
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#1c1917;">Your lithophane is attached</h1>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#292524;">The file <strong style="font-weight:700;">${filename}</strong> is attached as a ${formatLabel} model (${size}).</p>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#292524;">Open it in your slicer. Print it standing upright in white PLA or white resin with solid (100%) infill so the photo shows when the print is backlit.</p>
            <p style="margin:0;font-size:16px;line-height:1.5;color:#44403c;">You asked Lumiphane to email this file. If you did not, you can ignore this message. Lumiphane does not keep a copy of the attachment.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-size:14px;line-height:1.5;color:#44403c;">Lumiphane</td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  return { subject, html, text };
}

export function createRateLimiter(options?: { max?: number; windowMs?: number; now?: () => number }) {
  const max = options?.max ?? EMAIL_RATE_LIMIT;
  const windowMs = options?.windowMs ?? EMAIL_RATE_WINDOW_MS;
  const now = options?.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key: string): { allowed: boolean; retryAfterSeconds: number } {
      const time = now();
      const recent = (hits.get(key) ?? []).filter((stamp) => time - stamp < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? time;
        const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (time - oldest)) / 1000));
        return { allowed: false, retryAfterSeconds };
      }
      recent.push(time);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [id, stamps] of hits) {
          if (!stamps.some((stamp) => time - stamp < windowMs)) hits.delete(id);
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ip = raw.trim().replace(/^::ffff:/i, '');
  if (!ip || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  return ip;
}

function isLoopbackOrPrivate(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
}

/**
 * Use the socket address when the client connects directly, so a spoofed
 * X-Forwarded-For header cannot rotate the rate-limit bucket. Trust the
 * forwarded client only when the socket itself is a loopback or private hop.
 */
export function clientAddress(options: {
  socketAddress?: string | null;
  forwardedFor?: string | null;
}): string {
  const socket = normalizeIp(options.socketAddress) ?? 'unknown';
  const forwarded = normalizeIp(options.forwardedFor?.split(',')[0]);
  if (forwarded && socket !== 'unknown' && isLoopbackOrPrivate(socket)) return forwarded;
  return socket;
}

export type EmailSendErrorCode =
  | 'sender_not_verified'
  | 'email_config'
  | 'rejected'
  | 'too_large'
  | 'busy'
  | 'timeout'
  | 'network'
  | 'send_failed';

export interface EmailSendFailure {
  httpStatus: number;
  code: EmailSendErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Maps a failed send (Resend API error, timeout, or network problem) to the
 * status and plain-language message the browser shows.
 */
export function classifyEmailSendError(error: {
  statusCode?: number | null;
  name?: string | null;
  message?: string | null;
}): EmailSendFailure {
  const status = error.statusCode ?? 0;
  const name = (error.name || '').toLowerCase();
  const text = (error.message || '').toLowerCase();
  if (name === 'timeout') {
    return {
      httpStatus: 504,
      code: 'timeout',
      message: 'The email service did not respond in time. Download the file instead, or try again later.',
      retryable: false,
    };
  }
  if (name === 'network_error' || (!status && name !== 'request_build_failed')) {
    return {
      httpStatus: 502,
      code: 'network',
      message: 'The server could not reach the email service. Download the file instead, or try again later.',
      retryable: true,
    };
  }
  if (/not verified|verify (a|your) domain|domain is not verified|unverified/.test(text)) {
    return {
      httpStatus: 502,
      code: 'sender_not_verified',
      message: 'Email is not available yet because the sending domain has not been verified. Download the file instead.',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      httpStatus: 429,
      code: 'busy',
      message: 'The email service is busy. Wait a moment and try again, or download the file.',
      retryable: true,
    };
  }
  if (status === 413) {
    return { httpStatus: 413, code: 'too_large', message: emailTooLargeMessage(), retryable: false };
  }
  if (status === 401 || status === 403) {
    return {
      httpStatus: 502,
      code: 'email_config',
      message: 'Email could not be sent because of a server email configuration problem. Download the file instead.',
      retryable: false,
    };
  }
  if (status >= 500) {
    return {
      httpStatus: 502,
      code: 'send_failed',
      message: 'The email service had a problem. Try again, or download the file instead.',
      retryable: true,
    };
  }
  if (status >= 400) {
    return {
      httpStatus: 502,
      code: 'rejected',
      message: 'The email service rejected this message. Download the file instead.',
      retryable: false,
    };
  }
  return {
    httpStatus: 502,
    code: 'send_failed',
    message: 'The email could not be sent. Try again, or download the file instead.',
    retryable: false,
  };
}
