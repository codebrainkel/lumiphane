import express from 'express';
import http from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  EMAIL_ENVELOPE_RESERVE_BYTES,
  RESEND_MAX_TOTAL_BYTES,
  base64Length,
  buildExportEmail,
  classifyEmailSendError,
  clientAddress,
  createRateLimiter,
  emailTooLargeMessage,
  fileMatchesFormat,
  isEmailExportConfigured,
  isValidRecipientEmail,
  maxEmailAttachmentBytes,
  normalizeIdempotencyKey,
  redactEmailSecrets,
  resolveEmailFrom,
  resolveEmailedFormat,
  sanitizeExportFilename,
} from '../services/emailExport';
import {
  createEmailExportRouter,
  type EmailSendFn,
  type OutboundExportEmail,
} from '../../server/emailExportRouter';
import { buildResendRequestBody, createResendHttpSend, type TransportRequest } from '../../server/resendClient';

type Assert = (condition: boolean, testName: string, details?: string) => void;

function tinyStl(): Buffer {
  const bytes = Buffer.alloc(84 + 50);
  bytes.write('Lumiphane test', 0, 'ascii');
  bytes.writeUInt32LE(1, 80);
  return bytes;
}

function tiny3mf(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
}

async function withServer(router: express.Router, run: (base: string) => Promise<void>) {
  const app = express();
  app.use(router);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function postFile(
  base: string,
  bytes: Buffer,
  headers: Record<string, string>
): Promise<{ status: number; body: { message?: string; ok?: boolean; id?: string }; retryAfter: string | null }> {
  return fetch(`${base}/api/email-export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...headers,
    },
    body: new Uint8Array(bytes),
  }).then(async (response) => ({
    status: response.status,
    body: (await response.json().catch(() => ({}))) as { message?: string; ok?: boolean; id?: string },
    retryAfter: response.headers.get('retry-after'),
  }));
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

export async function runEmailExportTests(assert: Assert) {
  console.log('\n[14] Testing email export validation and the send endpoint...');

  const limit = maxEmailAttachmentBytes();
  const encoded = base64Length(limit);
  assert(
    encoded + EMAIL_ENVELOPE_RESERVE_BYTES <= RESEND_MAX_TOTAL_BYTES,
    'The attachment limit stays inside Resend’s 40 MB encoded budget'
  );
  assert(
    base64Length(limit + 3) + EMAIL_ENVELOPE_RESERVE_BYTES > RESEND_MAX_TOTAL_BYTES,
    'One more base64 group would exceed the 40 MB budget'
  );
  assert(emailTooLargeMessage().includes('too large'), 'Oversized files get a clear error');

  assert(isEmailExportConfigured('') === false, 'An empty Resend key disables email');
  assert(isEmailExportConfigured('re_xxxxxxxxx') === false, 'The example placeholder key disables email');
  assert(isEmailExportConfigured('re_short') === false, 'A short key disables email');
  assert(isEmailExportConfigured('sk_live_abcdefghijklmnop') === false, 'A non-Resend key disables email');
  assert(isEmailExportConfigured('re_test_key_abcdefghij') === true, 'A real-looking Resend key enables email');

  assert(isValidRecipientEmail('maker@example.com'), 'A normal address is accepted');
  assert(isValidRecipientEmail('maker+prints@example.co.uk'), 'Plus addressing is accepted');
  assert(isValidRecipientEmail('not-an-email') === false, 'An address without a domain is rejected');
  assert(isValidRecipientEmail('maker@example') === false, 'A domain without a dot is rejected');
  assert(isValidRecipientEmail('maker@example.com\nBcc: evil@example.com') === false, 'Header injection is rejected');
  assert(isValidRecipientEmail(' maker@example.com ') === true, 'Surrounding spaces are trimmed');

  assert(sanitizeExportFilename('my photo!.3mf', 'stl') === 'my_photo.stl', 'Emailed STL names are sanitized');
  assert(sanitizeExportFilename('../secret', '3mf') === 'secret.3mf', 'Path characters cannot change the extension');
  assert(resolveEmailedFormat('3mf', 'bambu-project') === 'bambu-project', 'A 3MF email keeps the Bambu project');
  assert(resolveEmailedFormat('3mf', 'stl') === 'universal', 'A 3MF email falls back to a standard 3MF');
  assert(resolveEmailedFormat('stl', 'bambu-project') === 'stl', 'An STL email ignores the 3MF card');

  const fromDefault = resolveEmailFrom(undefined);
  assert(fromDefault.ok === true && fromDefault.ok && fromDefault.from.includes('exports@lumiphane.com'), 'The sender defaults to exports@lumiphane.com');
  assert(resolveEmailFrom('not an address').ok === false, 'A broken EMAIL_FROM is refused');

  assert(normalizeIdempotencyKey('abc_123-XYZ', 'fallback') === 'lithophane-export/abc_123-XYZ', 'Idempotency keys keep the event prefix');
  assert(normalizeIdempotencyKey('bad key!', 'fallback-id').startsWith('lithophane-export/'), 'Unsafe idempotency characters are removed');
  assert(redactEmailSecrets('rejected re_test_key_abcdefghij').includes('re_redacted'), 'Logged errors do not keep the API key');
  assert(!redactEmailSecrets('rejected re_test_key_abcdefghij').includes('re_test_key'), 'The raw key is stripped');

  const message = buildExportEmail({ filename: 'panel_120x80mm.3mf', format: '3mf', byteLength: 2048 });
  assert(message.subject.includes('3MF'), 'The subject names the file type');
  assert(message.html.includes('lang="en"') && message.html.includes('dir="ltr"'), 'HTML sets language and direction');
  assert(message.html.includes('<h1'), 'The email has one heading');
  assert(message.html.includes('role="presentation"'), 'The layout table is presentational');
  assert(message.html.includes('panel_120x80mm.3mf'), 'The HTML names the attachment');
  assert(message.text.includes('panel_120x80mm.3mf'), 'The plain-text part names the attachment');
  assert(!message.text.includes('<h1'), 'The plain-text part is not HTML');
  assert(message.html.includes('If you did not'), 'The email explains that the recipient asked for the file');
  const escaped = buildExportEmail({ filename: 'a<b&c.stl', format: 'stl', byteLength: 100 });
  assert(escaped.html.includes('a&lt;b&amp;c.stl') && !escaped.html.includes('a<b'), 'Attachment names are escaped');

  const stl = tinyStl();
  const zip = tiny3mf();
  assert(fileMatchesFormat(stl, 'stl'), 'A one-triangle STL passes the email check');
  assert(fileMatchesFormat(zip, '3mf'), 'A ZIP header passes the 3MF check');
  assert(fileMatchesFormat(stl, '3mf') === false, 'An STL is not accepted as a 3MF');
  assert(fileMatchesFormat(zip, 'stl') === false, 'A ZIP is not accepted as an STL');

  let clock = 10_000;
  const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => clock });
  assert(limiter.check('203.0.113.5').allowed, 'The first send in a window is allowed');
  assert(limiter.check('203.0.113.5').allowed, 'The second send in a window is allowed');
  const blocked = limiter.check('203.0.113.5');
  assert(blocked.allowed === false && blocked.retryAfterSeconds >= 1, 'The third send is rate limited');
  assert(limiter.check('203.0.113.6').allowed, 'A different IP has its own limit');
  clock += 1000;
  assert(limiter.check('203.0.113.5').allowed, 'The limit resets after the window');

  assert(
    clientAddress({ socketAddress: '203.0.113.8', forwardedFor: '198.51.100.9' }) === '203.0.113.8',
    'A public socket ignores a spoofed forwarded address'
  );
  assert(
    clientAddress({ socketAddress: '127.0.0.1', forwardedFor: '203.0.113.9, 10.0.0.4' }) === '203.0.113.9',
    'A loopback proxy uses the forwarded client address'
  );
  assert(clientAddress({ socketAddress: '::ffff:10.1.1.1', forwardedFor: '192.0.2.8' }) === '192.0.2.8', 'IPv4-mapped private hops trust the forwarded client');

  const root = process.cwd();
  const clientFiles = walk(path.join(root, 'src')).filter(
    (file) =>
      (file.endsWith('.ts') || file.endsWith('.tsx')) &&
      !file.includes(`${path.sep}tests${path.sep}`)
  );
  const leaked = clientFiles.filter((file) => /RESEND_API_KEY|VITE_RESEND/.test(readFileSync(file, 'utf8')));
  assert(leaked.length === 0, 'Browser source does not mention the Resend API key', leaked.join(', '));

  const sent: OutboundExportEmail[] = [];
  const keys: string[] = [];
  const record: EmailSendFn = async (payload, options) => {
    sent.push(payload);
    keys.push(options.idempotencyKey);
    return { data: { id: 'email_123' }, error: null };
  };

  await withServer(
    createEmailExportRouter({
      getApiKey: () => '',
      send: async () => {
        throw new Error('disabled send');
      },
    }),
    async (base) => {
      const status = await fetch(`${base}/api/email-export/status`).then((response) => response.json());
      assert(status.enabled === false, 'Status reports email off without a key');
      assert(!JSON.stringify(status).includes('re_'), 'Status does not contain a key');
      const denied = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
      });
      assert(denied.status === 503, 'A missing key refuses the send');
    }
  );

  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: record,
      retryDelayMs: 0,
    }),
    async (base) => {
      const status = await fetch(`${base}/api/email-export/status`).then((response) => response.json());
      assert(status.enabled === true, 'Status reports email on for a configured key');

      const badEmail = await postFile(base, stl, {
        'X-Recipient-Email': 'nope',
        'X-Export-Format': 'stl',
      });
      assert(badEmail.status === 400, 'An invalid address is rejected before send');

      const ready = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
        'X-Model-Filename': 'night light.stl',
        'X-Idempotency-Key': 'click-1234',
      });
      assert(ready.status === 200 && ready.body.id === 'email_123', 'A valid STL is emailed');
      const payload = sent[0];
      assert(Boolean(payload), 'Resend was called for the valid STL');
      if (payload) {
        assert(payload.from === 'Lumiphane <exports@lumiphane.com>', 'The default sender is used');
        assert(payload.to.length === 1 && payload.to[0] === 'maker@example.com', 'The email goes only to the typed address');
        assert(payload.attachments[0].filename === 'night_light.stl', 'The attachment name is sanitized');
        assert(payload.attachments[0].content.equals(stl), 'The attachment bytes are the uploaded STL');
        assert(payload.html.includes('<h1') && payload.text.includes('night_light.stl'), 'HTML and plain text are both sent');
        assert(!JSON.stringify({ ...payload, attachments: [] }).includes('re_test_key'), 'The Resend payload does not contain the API key');
      }
      assert(keys[0] === 'lithophane-export/click-1234', 'The idempotency key uses the event prefix');

      const mismatch = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': '3mf',
      });
      assert(mismatch.status === 400, 'An STL labeled as 3MF is rejected');

      const zipped = await postFile(base, zip, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': '3mf',
        'X-Model-Filename': 'panel.3mf',
      });
      assert(zipped.status === 200, 'A 3MF package is emailed');
      assert(sent.at(-1)?.attachments[0].filename.endsWith('.3mf') === true, 'The 3MF attachment keeps its extension');
    }
  );

  let attempts = 0;
  const flaky: EmailSendFn = async () => {
    attempts += 1;
    if (attempts === 1) return { data: null, error: { message: 'unavailable', statusCode: 500 } };
    return { data: { id: 'email_retry' }, error: null };
  };
  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: flaky,
      retryDelayMs: 0,
      maxPerWindow: 5,
    }),
    async (base) => {
      const retried = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
      });
      assert(attempts === 2 && retried.status === 200 && retried.body.id === 'email_retry', 'A server error is retried once with the same send');
    }
  );

  const leaks: string[] = [];
  const secretFailure: EmailSendFn = async () => {
    leaks.push('called');
    return { data: null, error: { message: 'bad key re_test_key_abcdefghij', statusCode: 403 } };
  };
  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      getFrom: () => 'not-an-address',
      send: secretFailure,
      retryDelayMs: 0,
    }),
    async (base) => {
      const brokenFrom = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
      });
      assert(brokenFrom.status === 500 && leaks.length === 0, 'A bad sender is rejected before Resend is called');
    }
  );

  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: secretFailure,
      retryDelayMs: 0,
    }),
    async (base) => {
      const forbidden = await postFile(base, stl, {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
      });
      assert(forbidden.status === 502, 'A Resend rejection becomes a send failure');
      assert(!JSON.stringify(forbidden.body).includes('re_'), 'The browser error does not include the API key');
    }
  );

  let limitedSends = 0;
  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: async () => {
        limitedSends += 1;
        return { data: { id: 'email_limited' }, error: null };
      },
      maxPerWindow: 1,
      windowMs: 60_000,
      retryDelayMs: 0,
    }),
    async (base) => {
      const headers = {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
        'X-Forwarded-For': '203.0.113.10',
      };
      const first = await postFile(base, stl, headers);
      const second = await postFile(base, stl, headers);
      const other = await postFile(base, stl, { ...headers, 'X-Forwarded-For': '203.0.113.11' });
      assert(first.status === 200, 'The first email for an IP is accepted');
      assert(second.status === 429 && second.retryAfter !== null, 'The next email for that IP is rate limited');
      assert(other.status === 200, 'Another forwarded client is limited separately');
      assert(limitedSends === 2, 'Rate-limited requests do not call Resend');
    }
  );

  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: async () => {
        throw new Error('oversized');
      },
      maxAttachmentBytes: 32,
      retryDelayMs: 0,
    }),
    async (base) => {
      const oversized = await postFile(base, Buffer.alloc(64), {
        'X-Recipient-Email': 'maker@example.com',
        'X-Export-Format': 'stl',
      });
      assert(oversized.status === 413 && (oversized.body.message || '').includes('too large'), 'The body limit rejects a file past the email ceiling');
    }
  );

  console.log('\n[14b] Testing email send failures, timeouts, and memory-safe request bodies...');

  const notVerified = classifyEmailSendError({
    statusCode: 400,
    message: 'The associated domain with your API key is not verified. Please, create a new API key with full access or with a verified domain.',
  });
  assert(notVerified.code === 'sender_not_verified' && !notVerified.retryable, 'An unverified Resend domain gets its own clear error');
  assert(notVerified.message.includes('not been verified'), 'The unverified-domain message says what is wrong');
  const notVerified403 = classifyEmailSendError({ statusCode: 403, message: 'The lumiphane.com domain is not verified.' });
  assert(notVerified403.code === 'sender_not_verified', 'A 403 domain error is also reported as unverified');
  assert(classifyEmailSendError({ name: 'timeout', statusCode: null, message: 'slow' }).httpStatus === 504, 'A timeout becomes a 504');
  assert(classifyEmailSendError({ name: 'network_error', statusCode: null, message: 'ECONNRESET' }).code === 'network', 'A network error is reported as such');
  assert(classifyEmailSendError({ statusCode: 401, message: 'API key is invalid' }).code === 'email_config', 'A bad key is a configuration error');
  assert(classifyEmailSendError({ statusCode: 500, message: 'oops' }).retryable, 'A Resend 500 may be retried');
  assert(classifyEmailSendError({ statusCode: 422, message: 'Invalid `to` field' }).code === 'rejected', 'A validation error is not retried');

  const bigFile = Buffer.alloc(3 * 1024 * 1024 + 1, 7);
  const outbound: OutboundExportEmail = {
    from: 'Lumiphane <exports@lumiphane.com>',
    to: ['maker@example.com'],
    subject: 'Your STL "file"',
    html: '<p>é</p>',
    text: 'é',
    attachments: [{ filename: 'big.stl', content: bigFile, contentType: 'model/stl' }],
    tags: [{ name: 'email_type', value: 'lithophane-export' }],
  };
  const requestBody = buildResendRequestBody(outbound);
  const parsedBody = JSON.parse(requestBody.toString('utf8'));
  assert(parsedBody.attachments[0].content === bigFile.toString('base64'), 'The attachment is sent as one base64 string');
  assert(parsedBody.attachments[0].content_type === 'model/stl' && parsedBody.subject === outbound.subject, 'Other fields survive the hand-built body');
  assert(!requestBody.includes('"type":"Buffer"'), 'The attachment is not serialized as a JSON byte array');
  assert(requestBody.byteLength < bigFile.byteLength * 1.34 + 4096, 'The request body stays near the base64 size');

  const calls: { url: string; request: TransportRequest }[] = [];
  const okSend = createResendHttpSend('re_test_key_abcdefghij', {
    transport: async (url, request) => {
      calls.push({ url, request });
      return { status: 200, text: JSON.stringify({ id: 'email_http' }) };
    },
  });
  const okResult = await okSend(outbound, { idempotencyKey: 'lithophane-export/abc12345' });
  const sentHeaders = calls[0]?.request.headers || {};
  assert(calls[0]?.url === 'https://api.resend.com/emails', 'The HTTP sender posts to the Resend emails endpoint');
  assert(Buffer.isBuffer(calls[0]?.request.body), 'The HTTP sender passes the prebuilt body without copying it');
  assert(okResult.data?.id === 'email_http', 'The HTTP sender returns the Resend id');
  assert(sentHeaders['Idempotency-Key'] === 'lithophane-export/abc12345', 'The HTTP sender passes the idempotency key');
  assert(sentHeaders.Authorization === 'Bearer re_test_key_abcdefghij', 'The HTTP sender authenticates with the key');

  const rejectedSend = createResendHttpSend('re_test_key_abcdefghij', {
    transport: async () => ({
      status: 400,
      text: JSON.stringify({ statusCode: 400, name: 'validation_error', message: 'The associated domain with your API key is not verified.' }),
    }),
  });
  const rejectedResult = await rejectedSend(outbound, { idempotencyKey: 'k' });
  assert(rejectedResult.error?.statusCode === 400 && /not verified/.test(rejectedResult.error.message), 'The HTTP sender keeps the Resend error text');

  const hangingSend = createResendHttpSend('re_test_key_abcdefghij', {
    timeoutMs: 50,
    transport: (_url, request) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
  });
  const hungStarted = Date.now();
  const hungResult = await hangingSend(outbound, { idempotencyKey: 'k' });
  assert(hungResult.error?.name === 'timeout' && Date.now() - hungStarted < 2000, 'A hung Resend call times out');

  const brokenSend = createResendHttpSend('re_test_key_abcdefghij', {
    transport: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    },
  });
  const brokenResult = await brokenSend(outbound, { idempotencyKey: 'k' });
  assert(brokenResult.error?.name === 'network_error', 'A network failure is returned, not thrown');

  let unverifiedAttempts = 0;
  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: async () => {
        unverifiedAttempts += 1;
        return {
          data: null,
          error: { statusCode: 400, message: 'The associated domain with your API key is not verified.' },
        };
      },
      retryDelayMs: 0,
    }),
    async (base) => {
      const result = await postFile(base, stl, { 'X-Recipient-Email': 'maker@example.com', 'X-Export-Format': 'stl' });
      const body = result.body as { code?: string; message?: string };
      assert(result.status === 502 && body.code === 'sender_not_verified', 'The endpoint reports an unverified sender domain');
      assert(unverifiedAttempts === 1, 'An unverified domain is not retried');
    }
  );

  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: () => new Promise(() => {}),
      sendTimeoutMs: 150,
      retryDelayMs: 0,
    }),
    async (base) => {
      const started = Date.now();
      const result = await postFile(base, stl, { 'X-Recipient-Email': 'maker@example.com', 'X-Export-Format': 'stl' });
      assert(result.status === 504 && Date.now() - started < 3000, 'A send that never finishes returns 504 quickly');
    }
  );

  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: async () => {
        throw new Error('socket hang up re_test_key_abcdefghij');
      },
      retryDelayMs: 0,
      sendTimeoutMs: 500,
    }),
    async (base) => {
      const result = await postFile(base, stl, { 'X-Recipient-Email': 'maker@example.com', 'X-Export-Format': 'stl' });
      assert(result.status === 502 && typeof result.body.message === 'string', 'A throwing send returns JSON instead of crashing');
      assert(!JSON.stringify(result.body).includes('re_test'), 'The thrown error text is not sent to the browser');
      const status = await fetch(`${base}/api/email-export/status`);
      assert(status.status === 200, 'The server keeps serving after a failed send');
    }
  );

  let releaseSlow: () => void = () => {};
  await withServer(
    createEmailExportRouter({
      getApiKey: () => 're_test_key_abcdefghij',
      send: () =>
        new Promise((resolve) => {
          releaseSlow = () => resolve({ data: { id: 'email_slow' }, error: null });
        }),
      maxConcurrentSends: 1,
      retryDelayMs: 0,
    }),
    async (base) => {
      const headers = { 'X-Recipient-Email': 'maker@example.com', 'X-Export-Format': 'stl' };
      const first = postFile(base, stl, headers);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = await postFile(base, stl, headers);
      const secondBody = second.body as { code?: string };
      assert(second.status === 503 && secondBody.code === 'busy', 'A second upload during a send is turned away');
      releaseSlow();
      const done = await first;
      assert(done.status === 200, 'The first send still completes');
      const thirdPending = postFile(base, stl, headers);
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseSlow();
      const third = await thirdPending;
      assert(third.status === 200 && third.body.id === 'email_slow', 'The slot frees up after the send');
    }
  );
}
