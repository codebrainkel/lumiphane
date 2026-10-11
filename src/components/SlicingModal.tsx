import React from 'react';
import { X, Check, Printer, Info, HelpCircle } from 'lucide-react';
import { SLICER_PRESETS } from '../constants/presets';

interface SlicingModalProps {
  onClose: () => void;
}

export const SlicingModal: React.FC<SlicingModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#141720] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Printer className="h-5 w-5 shrink-0 text-amber-400" />
            <h3 className="text-base font-semibold leading-snug text-white">
              How to print this
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="sheet-scroll max-h-[75dvh] space-y-4 overflow-y-auto p-4 text-xs text-slate-300 sm:p-6">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
            <h4 className="font-semibold text-amber-300">Why Vertical Orientation Matters</h4>
            <p className="text-amber-100/80 leading-relaxed text-[11px]">
              When printing lithophanes horizontally, detail is constrained by your nozzle width (typically 0.4mm). Printing vertically allows the printer’s Z-axis resolution (0.08mm - 0.12mm layer height) to render photographic micro-gradients with exceptional fidelity.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
              Recommended Slicer Parameters
            </h4>
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
              <div className="bg-[#0e1118] border border-white/5 p-3 rounded-lg">
                <span className="text-slate-400 text-[11px]">Infill Density</span>
                <div className="text-sm font-semibold text-white font-mono mt-0.5">100% Solid</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Avoids internal infill grid shadows</p>
              </div>

              <div className="bg-[#0e1118] border border-white/5 p-3 rounded-lg">
                <span className="text-slate-400 text-[11px]">Layer Height</span>
                <div className="text-sm font-semibold text-white font-mono mt-0.5">0.10 – 0.12 mm</div>
                <p className="text-[10px] text-slate-500 mt-0.5">For fine tonal gradations</p>
              </div>

              <div className="bg-[#0e1118] border border-white/5 p-3 rounded-lg">
                <span className="text-slate-400 text-[11px]">Outer Wall Speed</span>
                <div className="text-sm font-semibold text-white font-mono mt-0.5">30 – 45 mm/s</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Low speed reduces ghosting artifacts</p>
              </div>

              <div className="bg-[#0e1118] border border-white/5 p-3 rounded-lg">
                <span className="text-slate-400 text-[11px]">Bed Adhesion</span>
                <div className="text-sm font-semibold text-white font-mono mt-0.5">5 – 8 mm Brim</div>
                <p className="text-[10px] text-slate-500 mt-0.5">Stabilizes tall vertical plates</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/5">
            <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
              Slicer Instructions
            </h4>
            <div className="space-y-2">
              {SLICER_PRESETS.map((p) => (
                <div key={p.name} className="p-3 bg-[#0e1118] border border-white/5 rounded-lg space-y-1">
                  <div className="font-medium text-slate-200">{p.name}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">{p.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 bg-[#10131a] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-xl bg-[#f0c36a] text-sm font-semibold text-slate-950 hover:bg-[#f6d48a] sm:w-auto sm:px-5"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
