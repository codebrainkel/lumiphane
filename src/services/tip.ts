/**
 * Tip amounts for the export sheet. Safe to import in the browser:
 * the Stripe secret never lives in this file.
 */

export const TIP_PRESETS_CENTS = [100, 300, 500] as const;
export const TIP_MIN_CENTS = 100;
export const TIP_MAX_CENTS = 20_000;

const PUBLIC_TIP_ORIGIN = 'https://lumiphane.com';

export const TIP_CURRENCY = 'usd';
export const TIP_STORAGE_KEY = 'lumiphane-tip';

export function formatTipDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function isStripeSecretConfigured(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (!/^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}$/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes('placeholder') || lower.includes('changeme') || lower.includes('your_')) return false;
  if (/x{4,}/i.test(trimmed)) return false;
  return true;
}

/** A publishable key id (mk_…) and a publishable key (pk_…) cannot create a charge. */
export function describeTipAmount(input: string): { cents: number } | { message: string } {
  const cleaned = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!cleaned) return { message: 'Enter an amount.' };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { message: 'Use a dollar amount, like 4 or 4.50.' };
  const [whole, frac = ''] = cleaned.split('.');
  if (whole.length > 6) return { message: `The largest tip here is ${formatTipDollars(TIP_MAX_CENTS)}.` };
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return { message: 'Use a dollar amount, like 4 or 4.50.' };
  if (cents < TIP_MIN_CENTS) return { message: `The smallest tip is ${formatTipDollars(TIP_MIN_CENTS)}.` };
  if (cents > TIP_MAX_CENTS) return { message: `The largest tip here is ${formatTipDollars(TIP_MAX_CENTS)}.` };
  return { cents };
}

export function acceptedTipCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < TIP_MIN_CENTS || value > TIP_MAX_CENTS) return null;
  return value;
}

export function tipReturnOrigin(hostHeader: string | undefined): string {
  const host = (hostHeader ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  if (host === 'localhost:3000' || host === '127.0.0.1:3000' || host === '[::1]:3000') {
    return `http://${host}`;
  }
  return PUBLIC_TIP_ORIGIN;
}

export function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && url.pathname.startsWith('/');
  } catch {
    return false;
  }
}

export function checkoutSessionBody(amountCents: number, origin: string, productId: string | null): URLSearchParams {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('submit_type', 'donate');
  // Keep tips in a separate tab so the lithophane work is not wiped.
  params.set('success_url', `${origin}/tip-thanks.html`);
  params.set('cancel_url', `${origin}/tip-cancel.html`);
  params.set('currency', TIP_CURRENCY);
  // Dashboard Adaptive Pricing can still localize presentment; lock the session to USD.
  params.set('adaptive_pricing[enabled]', 'false');
  params.set('metadata[kind]', 'tip');
  params.set('payment_intent_data[description]', 'Tip for Lumiphane');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', TIP_CURRENCY);
  params.set('line_items[0][price_data][unit_amount]', String(amountCents));
  if (productId) {
    params.set('line_items[0][price_data][product]', productId);
  } else {
    params.set('line_items[0][price_data][product_data][name]', 'Lumiphane tip');
    params.set('line_items[0][price_data][product_data][metadata][lumiphane]', 'tip');
  }
  return params;
}

export function redactStripeSecrets(value: string): string {
  return value
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/\bmk_[A-Za-z0-9]+/g, '[redacted]');
}
