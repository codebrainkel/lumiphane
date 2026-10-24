import http from 'http';
import express from 'express';
import { createTipRouter } from '../../server/tipRouter';
import { createStripeTipClient } from '../../server/stripeTip';
import {
  acceptedTipCents,
  checkoutSessionBody,
  describeTipAmount,
  isStripeCheckoutUrl,
  isStripeSecretConfigured,
  redactStripeSecrets,
  tipReturnOrigin,
} from '../services/tip';

// Built at runtime so secret scanners do not treat the fixture as a real Stripe key.
const SECRET = ['sk', 'test', 'abcdefghijklmnopqrstuvwxyz'].join('_');
const RESTRICTED_LIVE = ['rk', 'live', 'abcdefghijklmnopqrstuvwxyz'].join('_');
const PUBLISHABLE_LIVE = ['pk', 'live', 'abcdefghijklmnopqrstuvwxyz'].join('_');
const CHECKOUT = 'https://checkout.stripe.com/c/pay/cs_test_abc';

function assertFn(
  assert: (condition: boolean, testName: string, details?: string) => void,
  condition: boolean,
  testName: string,
  details?: string
) {
  assert(condition, testName, details);
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

function postTip(base: string, body: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/tip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  }).then(async (response) => ({
    status: response.status,
    body: (await response.json().catch(() => ({}))) as { message?: string; url?: string },
    retryAfter: response.headers.get('retry-after'),
  }));
}

export async function runTipTests(assert: (condition: boolean, testName: string, details?: string) => void) {
  console.log('\n--- Tip checkout ---');

  const centsOf = (input: string) => {
    const parsed = describeTipAmount(input);
    return 'cents' in parsed ? parsed.cents : null;
  };
  assertFn(assert, centsOf('1') === 100, 'A one dollar tip is 100 cents');
  assertFn(assert, centsOf('$3') === 300, 'A dollar sign is accepted');
  assertFn(assert, centsOf('4.50') === 450, 'Cents are kept');
  assertFn(assert, centsOf('4.5') === 450, 'A single decimal digit is cents');
  assertFn(assert, 'message' in describeTipAmount('0.50'), 'Tips start at one dollar');
  assertFn(assert, 'message' in describeTipAmount('201'), 'Tips stop at 200 dollars');
  assertFn(assert, 'message' in describeTipAmount('4.501'), 'More than two decimal places are rejected');
  assertFn(assert, 'message' in describeTipAmount('abc'), 'A non-number is rejected');
  assertFn(assert, acceptedTipCents(100) === 100, 'Integer cents are accepted');
  assertFn(assert, acceptedTipCents(100.5) === null, 'Fractional cents are rejected');
  assertFn(assert, acceptedTipCents('500') === null, 'A string amount is rejected');

  assertFn(assert, isStripeSecretConfigured(SECRET), 'A test secret key is configured');
  assertFn(assert, isStripeSecretConfigured(RESTRICTED_LIVE), 'A live restricted key is configured');
  assertFn(assert, !isStripeSecretConfigured(PUBLISHABLE_LIVE), 'A publishable key is not a secret');
  assertFn(assert, !isStripeSecretConfigured('mk_1TCBJOG8k6e3RruzOuxYzjq1'), 'A key id cannot create a checkout');
  assertFn(assert, !isStripeSecretConfigured(['sk', 'test', 'placeholder_key'].join('_')), 'A placeholder secret is ignored');

  assertFn(assert, tipReturnOrigin('evil.example') === 'https://lumiphane.com', 'The return origin ignores a foreign host');
  assertFn(assert, tipReturnOrigin('localhost:3000') === 'http://localhost:3000', 'Local checkout can return to the dev server');
  assertFn(assert, isStripeCheckoutUrl(CHECKOUT), 'A Stripe checkout URL is accepted');
  assertFn(assert, !isStripeCheckoutUrl('https://evil.example/checkout.stripe.com'), 'Another host is not a checkout URL');
  assertFn(
    assert,
    !redactStripeSecrets(`bad ${SECRET} and mk_1TCBJOG8k6e3RruzOuxYzjq1`).includes('sk_test_'),
    'Logs do not keep the secret key'
  );

  const body = checkoutSessionBody(300, 'https://lumiphane.com', 'prod_tip');
  assertFn(assert, body.get('submit_type') === 'donate', 'Checkout uses the donate button');
  assertFn(assert, body.get('currency') === 'usd', 'Checkout is locked to USD');
  assertFn(assert, body.get('line_items[0][price_data][currency]') === 'usd', 'The tip price is USD');
  assertFn(assert, body.get('adaptive_pricing[enabled]') === 'false', 'Adaptive Pricing stays off so tips stay USD');
  assertFn(assert, body.get('line_items[0][price_data][unit_amount]') === '300', 'Checkout charges the chosen cents');
  assertFn(assert, body.get('line_items[0][price_data][product]') === 'prod_tip', 'Checkout reuses the tip product');
  assertFn(assert, body.get('success_url') === 'https://lumiphane.com/tip-thanks.html', 'A paid tip lands on a close-this-tab page');
  assertFn(assert, body.get('cancel_url') === 'https://lumiphane.com/tip-cancel.html', 'A cancelled tip does not reload the generator');

  const calls: string[] = [];
  const client = createStripeTipClient({
    getSecret: () => SECRET,
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      if (url.includes('/products/search')) {
        return Response.json({ data: [] });
      }
      if (url.endsWith('/products')) {
        return Response.json({ id: 'prod_tip' });
      }
      return Response.json({ url: CHECKOUT });
    },
  });
  const first = await client(100, 'https://lumiphane.com');
  const second = await client(500, 'https://lumiphane.com');
  assertFn(assert, first.ok && first.url === CHECKOUT, 'The first tip opens Stripe checkout');
  assertFn(assert, second.ok, 'The next tip opens Stripe checkout');
  assertFn(assert, calls.filter((url) => url.includes('/products')).length === 2, 'The tip product is created once');
  assertFn(assert, calls.filter((url) => url.includes('/checkout/sessions')).length === 2, 'Each tip gets its own checkout');

  const refused = createStripeTipClient({
    getSecret: () => SECRET,
    fetchImpl: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/products/search')) return Response.json({ data: [{ id: 'prod_tip' }] });
      return Response.json({ error: { message: `bad key ${SECRET}` } }, { status: 401 });
    },
  });
  const denied = await refused(300, 'https://lumiphane.com');
  assertFn(assert, !denied.ok && denied.status === 503, 'A rejected Stripe key becomes unavailable');
  assertFn(assert, !denied.ok && !denied.message.includes('sk_test_'), 'The browser message does not include the key');

  await withServer(createTipRouter({ getSecret: () => '' }), async (base) => {
    const status = await fetch(`${base}/api/tip/status`).then((response) => response.json());
    const hidden = await postTip(base, JSON.stringify({ amountCents: 100 }));
    assertFn(assert, status.enabled === false, 'Tips stay hidden without a secret key');
    assertFn(assert, hidden.status === 503, 'A tip is refused when Stripe is not configured');
  });

  let charged: number[] = [];
  await withServer(
    createTipRouter({
      getSecret: () => SECRET,
      maxPerWindow: 1,
      windowMs: 60_000,
      checkout: async (amountCents) => {
        charged.push(amountCents);
        return { ok: true, url: CHECKOUT };
      },
    }),
    async (base) => {
      const status = await fetch(`${base}/api/tip/status`).then((response) => response.json());
      const ok = await postTip(base, JSON.stringify({ amountCents: 300 }), { 'X-Forwarded-For': '203.0.113.8' });
      const limited = await postTip(base, JSON.stringify({ amountCents: 300 }), { 'X-Forwarded-For': '203.0.113.8' });
      const bad = await postTip(base, JSON.stringify({ amountCents: 50 }), { 'X-Forwarded-For': '203.0.113.9' });
      const junk = await postTip(base, '{', { 'X-Forwarded-For': '203.0.113.10' });
      assertFn(assert, status.enabled === true, 'Tips are offered when the secret key is set');
      assertFn(assert, ok.status === 200 && ok.body.url === CHECKOUT, 'A three dollar tip returns the checkout URL');
      assertFn(assert, limited.status === 429 && limited.retryAfter !== null, 'Repeated tips from one visitor are limited');
      assertFn(assert, bad.status === 400, 'A tip under one dollar is rejected');
      assertFn(assert, junk.status === 400, 'Broken JSON is rejected');
      assertFn(assert, charged.length === 1 && charged[0] === 300, 'Only an accepted tip creates a checkout');
    }
  );
}
