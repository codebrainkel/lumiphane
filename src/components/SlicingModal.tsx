import React from 'react';
import { X, Check, Printer, Info, HelpCircle } from 'lucide-react';
import { SLICER_PRESETS } from '../constants/presets';

interface SlicingModalProps {
  onClose: () => void;
}

export const SlicingModal: React.FC<SlicingModalProps> = ({ onClose }) => {
  return (
    <div className="modal-scrim">
      <div className="modal-sheet">
        <div className="modal-grabber" />
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-[#0A84FF]" />
            <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-white">
              Slicing guide
            </h3>
          </div>
          <button
            onClick={onClose}
            className="icon-btn text-[#8E8E93]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body p-4 sm:p-6 space-y-4 text-[13px] text-slate-300">
          <div className="p-3.5 bg-[#0A84FF]/10 border border-[#0A84FF]/20 rounded-xl space-y-2">
            <h4 className="font-semibold text-[#64B5FF]">Why Vertical Orientation Matters</h4>
            <p className="text-[#D6EBFF]/90 leading-relaxed text-[11px]">
              When printing lithophanes horizontally, detail is constrained by your nozzle width (typically 0.4mm). Printing vertically allows the printer’s Z-axis resolution (0.08mm - 0.12mm layer height) to render photographic micro-gradients with exceptional fidelity.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-white text-xs uppercase tracking-wider">
              Recommended Slicer Parameters
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
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
        <div className="px-4 sm:px-6 py-3 border-t border-white/10">
          <button type="button" onClick={onClose} className="btn-fill w-full">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
