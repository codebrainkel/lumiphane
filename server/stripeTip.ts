import {
  checkoutSessionBody,
  isStripeCheckoutUrl,
  redactStripeSecrets,
} from '../src/services/tip';

const STRIPE_API = 'https://api.stripe.com/v1';
const PRODUCT_QUERY = "metadata['lumiphane']:'tip'";

const UNAVAILABLE = 'Tips are not available right now.';
const STRIPE_BUSY = 'Stripe is busy. Try that tip again in a moment.';
const OPEN_FAILED = 'The tip page did not open. Try again.';

export interface TipCheckoutOk {
  ok: true;
  url: string;
}

export interface TipCheckoutErr {
  ok: false;
  status: number;
  message: string;
}

export type TipCheckoutResult = TipCheckoutOk | TipCheckoutErr;

type StripeResponse = { status: number; json: StripePayload | null };
type StripePayload = {
  id?: unknown;
  url?: unknown;
  data?: { id?: unknown }[];
  error?: { message?: unknown };
};

async function readStripe(response: Response): Promise<StripeResponse> {
  const json = (await response.json().catch(() => null)) as StripePayload | null;
  return { status: response.status, json };
}

function failure(status: number, message: string): TipCheckoutErr {
  return { ok: false, status, message };
}

function fromStripeStatus(status: number, payload: StripePayload | null): TipCheckoutErr {
  const raw = typeof payload?.error?.message === 'string' ? payload.error.message : '';
  if (raw) console.error(`Stripe tip checkout failed (${status}): ${redactStripeSecrets(raw)}`);
  else console.error(`Stripe tip checkout failed (${status})`);
  if (status === 429) return failure(429, STRIPE_BUSY);
  if (status === 401 || status === 403) return failure(503, UNAVAILABLE);
  return failure(502, OPEN_FAILED);
}

export function createStripeTipClient(options: {
  getSecret: () => string;
  fetchImpl?: typeof fetch;
}): (amountCents: number, origin: string) => Promise<TipCheckoutResult> {
  let productId: string | null = null;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function stripe(path: string, body?: URLSearchParams, method = 'POST'): Promise<StripeResponse> {
    const response = await fetchImpl(`${STRIPE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${options.getSecret()}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
      signal: AbortSignal.timeout(12_000),
    });
    return readStripe(response);
  }

  async function ensureProduct(): Promise<string | null> {
    if (productId) return productId;
    const query = encodeURIComponent(PRODUCT_QUERY);
    const found = await stripe(`/products/search?query=${query}&limit=1`, undefined, 'GET');
    const existing = found.json?.data?.[0]?.id;
    if (found.status === 200 && typeof existing === 'string' && existing.startsWith('prod_')) {
      productId = existing;
      return productId;
    }
    const createBody = new URLSearchParams();
    createBody.set('name', 'Lumiphane tip');
    createBody.set('metadata[lumiphane]', 'tip');
    const created = await stripe('/products', createBody);
    const id = created.json?.id;
    if (created.status === 200 && typeof id === 'string' && id.startsWith('prod_')) {
      productId = id;
      return productId;
    }
    if (created.status !== 200) fromStripeStatus(created.status, created.json);
    return null;
  }

  return async function checkout(amountCents: number, origin: string): Promise<TipCheckoutResult> {
    let product: string | null = null;
    try {
      product = await ensureProduct();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`Stripe tip product lookup failed: ${redactStripeSecrets(detail)}`);
    }

    let session: StripeResponse;
    try {
      session = await stripe('/checkout/sessions', checkoutSessionBody(amountCents, origin, product));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`Stripe tip checkout request failed: ${redactStripeSecrets(detail)}`);
      return failure(502, OPEN_FAILED);
    }

    if (session.status !== 200) {
      if (product && session.status === 400) {
        productId = null;
      }
      return fromStripeStatus(session.status, session.json);
    }

    const url = session.json?.url;
    if (typeof url !== 'string' || !isStripeCheckoutUrl(url)) return failure(502, OPEN_FAILED);
    return { ok: true, url };
  };
}
