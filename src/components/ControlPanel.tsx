import React from 'react';
import {
  LithophaneSettings,
  SamplePresetImage,
  SupportType,
} from '../types/lithophane';
import { SAMPLE_IMAGES } from '../constants/presets';
import {
  Image as ImageIcon,
  Crop as CropIcon,
  RotateCcw,
  Download,
  HelpCircle,
} from 'lucide-react';

interface ControlPanelProps {
  settings: LithophaneSettings;
  onUpdateSettings: (newSettings: Partial<LithophaneSettings>) => void;
  onUpdateWidth: (width: number) => void;
  onResetSettings: () => void;
  onSelectSample: (sample: SamplePresetImage) => void;
  onOpenCrop: () => void;
  onUploadClick: () => void;
  onOpenExport: () => void;
  onOpenSlicingGuide: () => void;
  aspectRatio: number;
  previewDataUrl: string | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onUpdateSettings,
  onUpdateWidth,
  onResetSettings,
  onSelectSample,
  onOpenCrop,
  onUploadClick,
  onOpenExport,
  onOpenSlicingGuide,
  aspectRatio,
  previewDataUrl,
}) => {
  return (
    <aside className="w-full lg:w-88 xl:w-96 bg-[#0d0f16] border-l border-white/[0.08] flex flex-col h-full overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#090b10]">
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
          Settings
        </span>
        <button
          onClick={onResetSettings}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors py-1 px-1.5 rounded hover:bg-white/5"
          title="Reset to defaults"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* 1. IMAGE */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Image Framing</span>
            <span className="text-amber-300/90 font-mono text-[11px] font-medium">
              {aspectRatio >= 1.05
                ? `${aspectRatio.toFixed(2)}:1 Landscape`
                : aspectRatio <= 0.95
                ? `${aspectRatio.toFixed(2)}:1 Portrait`
                : '1:1 Square'}
            </span>
          </div>

          <div className="p-2.5 bg-[#131620] border border-white/[0.08] rounded-xl flex items-center gap-3">
            {previewDataUrl ? (
              <img
                src={previewDataUrl}
                alt="Source preview"
                className="w-12 h-12 object-cover rounded-lg border border-white/10 shrink-0 bg-black"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-slate-500" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={onUploadClick}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-white/[0.08] hover:bg-white/[0.15] rounded-md transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={onOpenCrop}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 rounded-md transition-colors"
                >
                  <CropIcon className="w-3 h-3" />
                  <span>Crop</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sample Thumbnails */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            {SAMPLE_IMAGES.map((sample) => (
              <button
                key={sample.id}
                onClick={() => onSelectSample(sample)}
                className="group flex flex-col items-center p-1.5 rounded-lg bg-[#131620] border border-white/[0.06] hover:border-amber-400/50 transition-all text-left"
              >
                <div className="w-full aspect-square rounded-md overflow-hidden bg-black mb-1 border border-white/10">
                  <img
                    src={sample.url}
                    alt={sample.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-300 truncate w-full text-center">
                  {sample.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 2. SHAPE & SIZE */}
        <section className="space-y-3 pt-4 border-t border-white/[0.08]">
          <span className="text-xs font-medium text-slate-300 block">Shape</span>

          {/* Shape Toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#131620] border border-white/[0.06] rounded-xl">
            <button
              onClick={() => onUpdateSettings({ shape: 'flat' })}
              className={`py-1.5 px-3 text-xs font-medium rounded-lg transition-all text-center ${
                settings.shape === 'flat'
                  ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Flat Plate
            </button>
            <button
              onClick={() => onUpdateSettings({ shape: 'curved', curveAngle: 75 })}
              className={`py-1.5 px-3 text-xs font-medium rounded-lg transition-all text-center ${
                settings.shape === 'curved'
                  ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Curved Arc
            </button>
          </div>

          {/* Dimensions */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-slate-300">Size</span>
              <span className="font-mono tabular-nums text-white font-medium">
                {settings.width} × {settings.height} mm
              </span>
            </div>

            <input
              type="range"
              min="60"
              max="220"
              step="5"
              value={settings.width}
              onChange={(e) => onUpdateWidth(Number(e.target.value))}
              className="w-full accent-amber-400 h-1.5 bg-[#202534] rounded cursor-pointer"
            />

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1.5">
              {[80, 120, 160, 200].map((w) => {
                const isActive = Math.abs(settings.width - w) < 4;
                return (
                  <button
                    key={w}
                    onClick={() => onUpdateWidth(w)}
                    className={`py-1 text-xs font-mono rounded-lg border text-center transition-all ${
                      isActive
                        ? 'bg-amber-400/10 border-amber-400/50 text-amber-300 font-semibold'
                        : 'bg-[#131620] border-white/[0.06] text-slate-400 hover:text-white'
                    }`}
                  >
                    {w}mm
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. BASE SUPPORT */}
        <section className="space-y-3 pt-4 border-t border-white/[0.08]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Base Stand</span>
            <span className="text-[11px] font-mono text-slate-400">
              {settings.supportType === 'none' ? 'None' : `${settings.supportBaseDepth ?? 14}mm`}
            </span>
          </div>

          {/* Base Type Segmented Controls */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#131620] border border-white/[0.06] rounded-xl text-center">
            {(
              [
                { id: 'flange', label: 'Flange' },
                { id: 'buttress', label: 'Fins' },
                { id: 'full', label: 'Full' },
                { id: 'none', label: 'None' },
              ] as { id: SupportType; label: string }[]
            ).map((b) => (
              <button
                key={b.id}
                onClick={() => onUpdateSettings({ supportType: b.id })}
                className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                  (settings.supportType || 'flange') === b.id
                    ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Base Depth & Height Sliders */}
          {settings.supportType !== 'none' && (
            <div className="space-y-2.5 pt-0.5">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Footprint Depth</span>
                  <span className="font-mono tabular-nums text-white">
                    {settings.supportBaseDepth ?? 14} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="26"
                  step="1"
                  value={settings.supportBaseDepth ?? 14}
                  onChange={(e) =>
                    onUpdateSettings({ supportBaseDepth: Number(e.target.value) })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-[#202534] rounded cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Taper Height</span>
                  <span className="font-mono tabular-nums text-white">
                    {settings.supportHeight ?? 8} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="16"
                  step="1"
                  value={settings.supportHeight ?? 8}
                  onChange={(e) =>
                    onUpdateSettings({ supportHeight: Number(e.target.value) })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-[#202534] rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </section>

        {/* 4. TONAL ADJUSTMENTS */}
        <section className="space-y-3 pt-4 border-t border-white/[0.08]">
          <span className="text-xs font-medium text-slate-300 block">Tonal Balance</span>

          {/* Contrast */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Contrast</span>
              <span className="font-mono tabular-nums text-white">
                {settings.contrast > 0 ? `+${settings.contrast}` : settings.contrast}%
              </span>
            </div>
            <input
              type="range"
              min="-30"
              max="35"
              step="1"
              value={settings.contrast}
              onChange={(e) => onUpdateSettings({ contrast: Number(e.target.value) })}
              className="w-full accent-amber-400 h-1.5 bg-[#202534] rounded cursor-pointer"
            />
          </div>

          {/* Brightness */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Brightness</span>
              <span className="font-mono tabular-nums text-white">
                {settings.brightness > 0 ? `+${settings.brightness}` : settings.brightness}%
              </span>
            </div>
            <input
              type="range"
              min="-30"
              max="30"
              step="1"
              value={settings.brightness}
              onChange={(e) => onUpdateSettings({ brightness: Number(e.target.value) })}
              className="w-full accent-amber-400 h-1.5 bg-[#202534] rounded cursor-pointer"
            />
          </div>

          {/* Invert */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-300">Invert Black & White</span>
            <button
              onClick={() => onUpdateSettings({ invert: !settings.invert })}
              className={`w-8 h-4.5 rounded-full transition-colors relative ${
                settings.invert ? 'bg-amber-400' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-slate-950 absolute top-0.5 transition-transform ${
                  settings.invert ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </section>

        {/* 5. ACTIONS */}
        <section className="space-y-2 pt-4 border-t border-white/[0.08]">
          <button
            onClick={onOpenExport}
            className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export 3MF / STL</span>
          </button>

          <button
            onClick={onOpenSlicingGuide}
            className="w-full py-1.5 px-3 text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Slicer Settings Guide</span>
          </button>
        </section>
      </div>
    </aside>
  );
};
