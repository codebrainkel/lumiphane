import React from 'react';
import { X, Printer, Check } from 'lucide-react';
import { SLICER_PRESETS } from '../constants/presets';

interface SlicingModalProps {
  onClose: () => void;
}

export const SlicingModal: React.FC<SlicingModalProps> = ({ onClose }) => {
  return (
    <div className="modal-scrim">
      <div className="modal-dialog">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Printer className="w-4 h-4 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                3D Printing Guide
              </h3>
              <p className="text-xs text-amber-400/90 font-mono font-bold mt-0.5">
                Recommended settings for white PLA filament
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body p-5 space-y-4 text-xs text-slate-300">
          {/* Main Tip */}
          <div className="p-3.5 rounded-md bg-[#141924] border border-amber-400/30">
            <h4 className="font-bold text-amber-400 text-xs tracking-tight mb-1">
              Print Vertically for Sharp Details
            </h4>
            <p className="text-slate-300 leading-relaxed font-mono text-[11px]">
              Always print your lithophane standing upright on the print bed. Your printer creates much finer photo details between vertical layers (0.12mm) than across horizontal lines.
            </p>
          </div>

          {/* Calibrated Parameter Grid */}
          <div>
            <h4 className="font-semibold text-slate-300 text-xs uppercase tracking-wider font-mono mb-2">
              Key Slicer Settings
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-md bg-[#141924] border border-white/10">
                <span className="text-slate-400 text-[11px] font-mono">Infill</span>
                <div className="text-xs font-semibold text-white font-mono mt-0.5">100% Solid</div>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Prevents internal grid shadows in light</p>
              </div>

              <div className="p-3 rounded-md bg-[#141924] border border-white/10">
                <span className="text-slate-400 text-[11px] font-mono">Layer Height</span>
                <div className="text-xs font-semibold text-white font-mono mt-0.5">0.12 mm</div>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Use 0.08–0.12mm for sharpest photos</p>
              </div>

              <div className="p-3 rounded-md bg-[#141924] border border-white/10">
                <span className="text-slate-400 text-[11px] font-mono">Print Speed</span>
                <div className="text-xs font-semibold text-white font-mono mt-0.5">30 – 40 mm/s</div>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Gentle speed prevents ripples and wobble</p>
              </div>

              <div className="p-3 rounded-md bg-[#141924] border border-white/10">
                <span className="text-slate-400 text-[11px] font-mono">Bed Adhesion</span>
                <div className="text-xs font-semibold text-white font-mono mt-0.5">5 – 8 mm Brim</div>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">Keeps tall prints firmly attached to bed</p>
              </div>
            </div>
          </div>

          {/* Slicer Presets */}
          <div>
            <h4 className="font-semibold text-slate-300 text-xs uppercase tracking-wider font-mono mb-2">
              Tips by Slicer
            </h4>
            <div className="space-y-2">
              {SLICER_PRESETS.map((p) => (
                <div key={p.name} className="p-3 rounded-md bg-[#141924] border border-white/10 space-y-1">
                  <div className="font-semibold text-white text-xs">{p.name}</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed font-mono">{p.notes}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/10 bg-[#10141d]">
          <a href="/lithophane-settings/" className="text-xs font-semibold text-amber-300 hover:text-white">
            Lithophane settings
          </a>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Got it</span>
          </button>
        </div>
      </div>
    </div>
  );
};
