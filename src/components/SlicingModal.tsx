import React from 'react';
import { X, Check, Printer, Info, HelpCircle } from 'lucide-react';
import { SLICER_PRESETS } from '../constants/presets';

interface SlicingModalProps {
  onClose: () => void;
}

export const SlicingModal: React.FC<SlicingModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#141720] border border-white/10 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              FDM 3D Printing & Slicing Best Practices
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300 overflow-y-auto max-h-[75vh]">
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
        <div className="flex justify-end px-6 py-4 border-t border-white/10 bg-[#10131a]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
