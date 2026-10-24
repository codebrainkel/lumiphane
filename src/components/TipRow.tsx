import React, { useState } from 'react';
import {
  TIP_PRESETS_CENTS,
  describeTipAmount,
  formatTipDollars,
  isStripeCheckoutUrl,
} from '../services/tip';

const OPEN_FAILED = 'The tip page did not open. Try again.';

export const TipRow: React.FC = () => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCheckout = async (cents: number) => {
    setError(null);
    setPending(true);
    // Open during the click so the browser allows the tab; never leave this page.
    const tipTab = window.open('about:blank', '_blank');
    try {
      const response = await fetch('/api/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = (await response.json().catch(() => null)) as { url?: unknown; message?: unknown } | null;
      const url = typeof data?.url === 'string' ? data.url : '';
      if (!response.ok || !isStripeCheckoutUrl(url)) {
        tipTab?.close();
        setError(typeof data?.message === 'string' && data.message ? data.message : OPEN_FAILED);
        return;
      }
      if (tipTab) {
        tipTab.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      tipTab?.close();
      setError(OPEN_FAILED);
    } finally {
      setPending(false);
    }
  };

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = describeTipAmount(customAmount);
    if ('message' in parsed) {
      setError(parsed.message);
      return;
    }
    void openCheckout(parsed.cents);
  };

  return (
    <div className="export-tip" role="group" aria-label="Optional tip in US dollars" aria-busy={pending || undefined}>
      <p className="export-tip-prompt">Leave a tip?</p>
      <p className="export-tip-sub">USD · optional</p>
      <div className="export-tip-amounts">
        {TIP_PRESETS_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            className="export-tip-amt"
            disabled={pending}
            onClick={() => void openCheckout(cents)}
          >
            {formatTipDollars(cents)}
          </button>
        ))}
        {customOpen ? (
          <form className="export-tip-form" onSubmit={submitCustom}>
            <label className="export-tip-field">
              <span className="sr-only">Custom tip in US dollars</span>
              <span aria-hidden="true" className="export-tip-dollar">$</span>
              <input
                className="export-tip-custom"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                maxLength={8}
                placeholder="4"
                value={customAmount}
                autoFocus
                disabled={pending}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setCustomAmount(event.target.value);
                  setError(null);
                }}
              />
            </label>
            <button type="submit" className="export-tip-amt export-tip-go" disabled={pending}>
              {pending ? '…' : 'Tip'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="export-tip-amt"
            disabled={pending}
            onClick={() => {
              setError(null);
              setCustomOpen(true);
            }}
          >
            Custom
          </button>
        )}
      </div>
      {error && (
        <p className="export-tip-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
