import React, { useEffect, useState } from 'react';
import { MeshGeometryData } from '../types/lithophane';
import { StlExporter } from '../services/stlExporter';
import { isTreatstockHttpsUrl, MAX_STL_BYTES } from '../services/printOrder';
import { trackPrintCheckout, trackPrintOrderReady } from '../services/analytics';
import { AlertCircle, ExternalLink, Printer, X } from 'lucide-react';

interface OrderPrintModalProps {
  geometryData: MeshGeometryData;
  imageName: string;
  shape: string;
  photoCount: number;
  onClose: () => void;
}

interface CheckoutReady {
  checkoutUrl: string;
  material: string | null;
  color: string | null;
  price: number | null;
  expiresInHours: number;
}

export const OrderPrintModal: React.FC<OrderPrintModalProps> = ({
  geometryData,
  imageName,
  shape,
  photoCount,
  onClose,
}) => {
  const [phase, setPhase] = useState<'uploading' | 'ready' | 'error'>('uploading');
  const [message, setMessage] = useState('Building the STL and sending it to Treatstock…');
  const [checkout, setCheckout] = useState<CheckoutReady | null>(null);

  useEffect(() => {
    let cancelled = false;

    const upload = async () => {
      try {
        const exported = StlExporter.exportBinaryStl(geometryData, imageName);
        if (exported.filesizeBytes > MAX_STL_BYTES) {
          throw new Error(
            'This lithophane is too large to upload. Lower the quality tier, then order again, or export the STL.'
          );
        }

        const response = await fetch('/api/print-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Model-Filename': exported.filename,
          },
          body: exported.blob,
        });
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          checkoutUrl?: string;
          material?: string | null;
          color?: string | null;
          price?: number | null;
          expiresInHours?: number;
        } | null;

        if (!response.ok || !payload?.checkoutUrl || !isTreatstockHttpsUrl(payload.checkoutUrl)) {
          throw new Error(payload?.message || 'Treatstock did not return a checkout link.');
        }
        if (cancelled) return;
        trackPrintOrderReady({ shape, photoCount });
        setCheckout({
          checkoutUrl: payload.checkoutUrl,
          material: payload.material ?? null,
          color: payload.color ?? null,
          price: typeof payload.price === 'number' ? payload.price : null,
          expiresInHours: payload.expiresInHours || 24,
        });
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'The print order could not be started.');
      }
    };

    void upload();
    return () => {
      cancelled = true;
    };
  }, [geometryData, imageName, photoCount, shape]);

  const materialLine = checkout?.material
    ? `${checkout.color ? `${checkout.color} ` : ''}${checkout.material}`
    : null;

  return (
    <div className="modal-scrim">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="order-print-title">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 id="order-print-title" className="text-base font-semibold text-white tracking-tight">
              Order a print
            </h2>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              Treatstock prints it and ships it to you
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body p-5 space-y-4">
          {phase === 'uploading' && (
            <div className="flex items-start gap-3 text-sm text-slate-200">
              <Printer className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
              <span>{message}</span>
            </div>
          )}

          {phase === 'error' && (
            <div className="p-3 rounded-md bg-red-950/40 border border-red-500/30 text-sm text-red-100 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>
          )}

          {phase === 'ready' && checkout && (
            <div className="space-y-3 text-sm text-slate-200 leading-relaxed">
              <p>
                Your lithophane is on Treatstock. Checkout is where you pay, choose shipping, and confirm the material.
                {materialLine
                  ? ` The link starts on ${materialLine}${checkout.price != null ? ` from about $${checkout.price.toFixed(2)}` : ''}.`
                  : ' Choose white PLA or white resin when you pick a material.'}
              </p>
              <p className="text-xs text-slate-400 font-mono leading-relaxed">
                Solid infill (100%) lets the photo show when the print is backlit. This upload stays available for {checkout.expiresInHours} hours.
                Lumiphane does not charge you.
              </p>
            </div>
          )}

          {phase !== 'ready' && (
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              White PLA or white resin, printed solid, is the material that makes a lithophane work. You can still export an STL or 3MF and print it yourself.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/10 bg-[#10141d]">
          <button type="button" onClick={onClose} className="btn-secondary text-xs py-1.5 px-3 min-h-[34px]">
            Close
          </button>
          {phase === 'ready' && checkout ? (
            <a
              href={checkout.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-xs py-1.5 px-4 min-h-[34px]"
              onClick={() => trackPrintCheckout({ shape, photoCount })}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span>Continue to Treatstock checkout</span>
            </a>
          ) : (
            <button type="button" disabled className="btn-primary text-xs py-1.5 px-4 min-h-[34px]">
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>{phase === 'error' ? 'Checkout unavailable' : 'Preparing checkout…'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
