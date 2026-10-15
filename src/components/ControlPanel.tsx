import React, { useEffect, useRef, useState } from 'react';
import {
  LithophaneSettings,
  SamplePresetImage,
  SupportType,
  CylinderSlot,
  LithophaneShape,
} from '../types/lithophane';
import {
  SAMPLE_IMAGES,
  getCylinderSlotLabels,
  getCubeSlotLabels,
  getMultiPanelSlotLabels,
  getOptimalCylinderWrapRatio,
  getOptimalCubeWrapRatio,
} from '../constants/presets';
import {
  ChevronDown,
  Crop as CropIcon,
  Download,
  HelpCircle,
  Upload,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface ControlPanelProps {
  settings: LithophaneSettings;
  onUpdateSettings: (newSettings: Partial<LithophaneSettings>) => void;
  onUpdateWidth: (width: number) => void;
  onResetSettings: () => void;
  onSelectSample: (sample: SamplePresetImage) => void;
  onOpenCrop: () => void;
  hasOwnPhoto: boolean;
  onUploadClick: () => void;
  onOpenExport: () => void;
  onOpenSlicingGuide: () => void;
  aspectRatio: number;
  previewDataUrl: string | null;
  activeSampleId: string;

  cylinderSlots?: CylinderSlot[];
  onOpenCropSlot?: (slotId: string) => void;
  onUploadSlotClick?: (slotId: string) => void;
  onNavigateToUploadStep?: () => void;
  onSetCylinderSlotCount?: (count: number) => void;
  onMatchCylinderHeightToPhoto?: () => void;
}

type PanelTab = 'photo' | 'size' | 'stand' | 'tone';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'photo', label: 'Photos' },
  { id: 'size', label: 'Dimensions' },
  { id: 'stand', label: 'Base Stand' },
  { id: 'tone', label: 'Image Adjust' },
];

function Slider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <label className="slider-row">
      <div className="slider-meta">
        <span>{label}</span>
        <span className="slider-value">{display}</span>
      </div>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  onUpdateSettings,
  onUpdateWidth,
  onResetSettings,
  onSelectSample,
  onOpenCrop,
  hasOwnPhoto,
  onUploadClick,
  onOpenExport,
  onOpenSlicingGuide,
  aspectRatio,
  previewDataUrl,
  activeSampleId,

  cylinderSlots = [],
  onOpenCropSlot,
  onUploadSlotClick,
  onNavigateToUploadStep,
  onSetCylinderSlotCount,
  onMatchCylinderHeightToPhoto,
}) => {
  const [tab, setTab] = useState<PanelTab>('photo');
  const [open, setOpen] = useState(true);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCylinder = settings.shape === 'cylinder';
  const isCube = settings.shape === 'cube';
  const isMultiPanel = isCylinder || isCube;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const showBody = open || isDesktop;

  const aspectLabel =
    aspectRatio >= 1.05
      ? `${aspectRatio.toFixed(2)}:1 landscape`
      : aspectRatio <= 0.95
        ? `${aspectRatio.toFixed(2)}:1 portrait`
        : '1:1 square';

  const selectTab = (next: PanelTab) => {
    if (!isDesktop && open && tab === next) {
      setOpen(false);
      return;
    }
    setTab(next);
    setOpen(true);
  };

  return (
    <aside className="dock" data-open={showBody}>
      {/* Dock Header with Tabs */}
      <div className="dock-bar">
        <div className="dock-tabs" role="tablist" aria-label="Inspector Controls">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={showBody && tab === item.id}
              aria-controls="adjust-panel"
              data-on={showBody && tab === item.id}
              className="seg-btn"
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dock-toggle"
          aria-expanded={open}
          aria-label={open ? 'Hide settings' : 'Show settings'}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="dock-body" data-open={showBody}>
        <div
          ref={scrollRef}
          id="adjust-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="sheet-scroll"
        >
          {/* ==============================================================
              TAB: PHOTOS
              ============================================================== */}
          {tab === 'photo' && (
            <>
              {isMultiPanel ? (
                /* Multi-Panel (Cylinder / Hollow Cube): 1 to 4 Photos */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span className="font-bold text-slate-300">
                      {isCube ? 'Cube Layout' : 'Cylinder Layout'}
                    </span>
                    <span className="text-amber-400 font-bold">
                      {cylinderSlots.length === 1
                        ? isCube ? '4-Face Wrap' : '360° Wrap'
                        : isCube ? `${cylinderSlots.length} Faces` : `${cylinderSlots.length} Sides`}
                    </span>
                  </div>

                  {/* 1, 2, 3, 4 Slot Count Switcher */}
                  {onSetCylinderSlotCount && (
                    <div className="grid grid-cols-4 gap-1 bg-[#090c12] p-1 rounded-md border border-white/10">
                      {[1, 2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => onSetCylinderSlotCount(count)}
                          className={`py-1 text-xs font-bold rounded-xs transition-colors ${
                            cylinderSlots.length === count
                              ? 'bg-amber-400 text-slate-950 font-semibold'
                              : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {count} {count === 1 ? 'Wrap' : 'Sides'}
                        </button>
                      ))}
                    </div>
                  )}

                  {previewDataUrl && (
                    <div className="rounded-md overflow-hidden border border-white/10 bg-black">
                      <img src={previewDataUrl} alt="Panorama preview" className="w-full h-12 object-cover opacity-90" />
                    </div>
                  )}

                  {cylinderSlots.length === 1 && onMatchCylinderHeightToPhoto && (
                    <button
                      type="button"
                      onClick={onMatchCylinderHeightToPhoto}
                      className="btn-secondary text-xs w-full py-1.5 min-h-[30px] text-amber-400 border-amber-400/30 hover:border-amber-400"
                      title="Adjust height to match photo aspect ratio"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Match Lamp Height to Photo</span>
                    </button>
                  )}

                  <div className="space-y-1.5">
                    {cylinderSlots.map((slot, idx) => {
                      const labels = getMultiPanelSlotLabels(settings.shape, cylinderSlots.length);
                      const labelInfo = labels[idx] || { label: `Side ${idx + 1}`, deg: '' };
                      return (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between p-2 rounded-md bg-[#141924] border border-white/10 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={slot.imageSrc}
                              alt=""
                              className="w-8 h-8 rounded-xs object-cover bg-black shrink-0 border border-white/10"
                            />
                            <div className="truncate">
                              <div className="font-medium text-white truncate flex items-center gap-1.5">
                                <span>{labelInfo.label}</span>
                                <span className="text-[10px] text-amber-400 font-mono font-bold">{labelInfo.deg}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">{slot.name}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onUploadSlotClick?.(slot.id)}
                              className="btn-secondary text-xs px-2 py-1 min-h-[26px]"
                              title="Replace photo"
                              aria-label={`Replace photo for ${labelInfo.label}`}
                            >
                              <Upload className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenCropSlot?.(slot.id)}
                              className="btn-secondary text-xs px-2 py-1 min-h-[26px]"
                              title="Crop photo"
                              aria-label={`Crop photo for ${labelInfo.label}`}
                            >
                              <CropIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {onNavigateToUploadStep && (
                    <button
                      type="button"
                      onClick={onNavigateToUploadStep}
                      className="btn-secondary text-xs w-full py-2 min-h-[32px] mt-2"
                    >
                      <span>Manage Photos in Studio</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Flat / Curved: Single Photo */
                <div className="space-y-3">
                  <div className="inset-panel p-3">
                    <div className="flex items-center gap-3">
                      {previewDataUrl ? (
                        <img
                          src={previewDataUrl}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover bg-black shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-black/40 shrink-0 border border-white/10" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {hasOwnPhoto ? activeSampleId : 'Sample Photo'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {aspectLabel}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={onUploadClick}
                        className="btn-secondary text-xs py-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{hasOwnPhoto ? 'Replace' : 'Upload'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenCrop}
                        className="btn-secondary text-xs py-1.5"
                      >
                        <CropIcon className="w-3.5 h-3.5" />
                        <span>Crop</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="section-kicker">Sample Photos</div>
                    <div className="grid grid-cols-4 gap-2">
                      {SAMPLE_IMAGES.map((sample) => (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => onSelectSample(sample)}
                          className={`rounded-md overflow-hidden border p-0.5 text-center transition-colors ${
                            activeSampleId === sample.id
                              ? 'border-amber-400 bg-[#1e2432] ring-1 ring-amber-400'
                              : 'border-white/10 bg-[#141924] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={sample.url} alt={sample.name} className="w-full h-10 object-cover rounded-xs" />
                          <span className="block text-[10px] text-slate-300 font-medium truncate mt-1">{sample.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ==============================================================
              TAB: SIZE & SHAPE
              ============================================================== */}
          {tab === 'size' && (
            <div className="space-y-4">
              <div>
                <div className="section-kicker">Shape</div>
                <div className="seg-grid grid-cols-4">
                  <button
                    type="button"
                    data-on={settings.shape === 'cylinder'}
                    onClick={() => onUpdateSettings({ shape: 'cylinder' })}
                    className="seg-btn"
                  >
                    Cylinder
                  </button>
                  <button
                    type="button"
                    data-on={settings.shape === 'cube'}
                    onClick={() => onUpdateSettings({ shape: 'cube', cubeWidth: settings.cubeWidth || 90, height: settings.height || 90 })}
                    className="seg-btn"
                  >
                    Cube
                  </button>
                  <button
                    type="button"
                    data-on={settings.shape === 'flat'}
                    onClick={() => onUpdateSettings({ shape: 'flat' })}
                    className="seg-btn"
                  >
                    Flat
                  </button>
                  <button
                    type="button"
                    data-on={settings.shape === 'curved'}
                    onClick={() => onUpdateSettings({ shape: 'curved', curveAngle: 75 })}
                    className="seg-btn"
                  >
                    Curved
                  </button>
                </div>
              </div>

              {isCube ? (
                /* Hollow Cube Dimensions */
                <div>
                  <div className="section-kicker">Dimensions</div>
                  <div className="inset-panel">
                    <Slider
                      label="Side Width"
                      min={40}
                      max={220}
                      step={2}
                      value={settings.cubeWidth || 90}
                      display={`${settings.cubeWidth || 90} mm`}
                      onChange={(val) => onUpdateSettings({ cubeWidth: val })}
                    />
                    <div className="panel-row">
                      <Slider
                        label="Height"
                        min={40}
                        max={220}
                        step={5}
                        value={settings.height || 90}
                        display={`${settings.height || 90} mm`}
                        onChange={(val) => onUpdateSettings({ height: val })}
                      />
                    </div>
                    {cylinderSlots?.length === 1 && onMatchCylinderHeightToPhoto && (
                      <div className="pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={onMatchCylinderHeightToPhoto}
                          className="btn-secondary text-xs w-full py-1.5 min-h-[28px] text-amber-400 border-amber-400/30 hover:border-amber-400"
                          title="Auto-adjust height so photo wraps with 0% cropping"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Match Height to Photo Aspect</span>
                        </button>
                      </div>
                    )}
                    <div className="chip-row border-t border-white/10 pt-2">
                      {[70, 80, 90, 100, 120, 150].map((dim) => (
                        <button
                          key={dim}
                          type="button"
                          data-on={Math.abs((settings.cubeWidth || 90) - dim) < 2}
                          onClick={() => onUpdateSettings({ cubeWidth: dim, height: dim })}
                          className="chip-btn"
                        >
                          {dim}mm
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : isCylinder ? (
                /* Cylinder Dimensions */
                <div>
                  <div className="section-kicker">Dimensions</div>
                  <div className="inset-panel">
                    <Slider
                      label="Diameter"
                      min={50}
                      max={300}
                      step={2}
                      value={settings.cylinderDiameter || 90}
                      display={`${settings.cylinderDiameter || 90} mm`}
                      onChange={(val) => onUpdateSettings({ cylinderDiameter: val })}
                    />
                    <div className="panel-row">
                      <Slider
                        label="Height"
                        min={50}
                        max={260}
                        step={5}
                        value={settings.height || 95}
                        display={`${settings.height || 95} mm`}
                        onChange={(val) => onUpdateSettings({ height: val })}
                      />
                    </div>
                    {cylinderSlots?.length === 1 && onMatchCylinderHeightToPhoto && (
                      <div className="pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={onMatchCylinderHeightToPhoto}
                          className="btn-secondary text-xs w-full py-1.5 min-h-[28px] text-amber-400 border-amber-400/30 hover:border-amber-400"
                          title="Auto-adjust cylinder height so photo wraps with 0% cropping"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Match Height to Photo Aspect</span>
                        </button>
                      </div>
                    )}
                    <div className="chip-row border-t border-white/10 pt-2">
                      {[75, 90, 120, 180, 240, 300].map((diam) => (
                        <button
                          key={diam}
                          type="button"
                          data-on={Math.abs((settings.cylinderDiameter || 90) - diam) < 2}
                          onClick={() => onUpdateSettings({ cylinderDiameter: diam })}
                          className="chip-btn"
                        >
                          {diam}mm
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Flat / Curved Dimensions */
                <div>
                  <div className="section-kicker">Dimensions</div>
                  <div className="inset-panel">
                    <Slider
                      label="Width"
                      min={60}
                      max={220}
                      step={5}
                      value={settings.width}
                      display={`${settings.width} × ${settings.height} mm`}
                      onChange={onUpdateWidth}
                    />
                    <div className="chip-row border-t border-white/10 pt-2">
                      {[80, 120, 160, 200].map((width) => (
                        <button
                          key={width}
                          type="button"
                          data-on={Math.abs(settings.width - width) < 4}
                          onClick={() => onUpdateWidth(width)}
                          className="chip-btn"
                        >
                          {width}mm
                        </button>
                      ))}
                    </div>

                    {settings.shape === 'curved' && (
                      <div className="panel-row">
                        <Slider
                          label="Curve Angle"
                          min={30}
                          max={120}
                          step={5}
                          value={settings.curveAngle || 75}
                          display={`${settings.curveAngle || 75}°`}
                          onChange={(val) => onUpdateSettings({ curveAngle: val })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==============================================================
              TAB: STAND & BED ADHESION
              ============================================================== */}
          {tab === 'stand' && (
            <div className="space-y-4">
              <div>
                <div className="section-kicker">Print Stand & Base</div>
                <div className="inset-panel">
                  <div className="p-3">
                    <div className="seg-grid grid-cols-4">
                      {(
                        [
                          { id: 'flange', label: isCylinder ? 'Brim' : 'Standard' },
                          { id: 'buttress', label: isCylinder ? 'Wide' : 'Finned' },
                          { id: 'full', label: 'Wide Base' },
                          { id: 'none', label: 'None' },
                        ] as { id: SupportType; label: string }[]
                      ).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          data-on={(settings.supportType || 'flange') === option.id}
                          onClick={() => onUpdateSettings({ supportType: option.id })}
                          className="seg-btn"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {settings.supportType !== 'none' && (
                    <div className="panel-row">
                      <Slider
                        label="Base Width"
                        min={6}
                        max={26}
                        step={1}
                        value={settings.supportBaseDepth ?? 14}
                        display={`${settings.supportBaseDepth ?? 14} mm`}
                        onChange={(value) => onUpdateSettings({ supportBaseDepth: value })}
                      />
                      <div className="panel-row">
                        <Slider
                          label="Base Height"
                          min={3}
                          max={16}
                          step={1}
                          value={settings.supportHeight ?? 8}
                          display={`${settings.supportHeight ?? 8} mm`}
                          onChange={(value) => onUpdateSettings({ supportHeight: value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed font-mono px-1">
                Adds a wider base so your lithophane stays firmly in place while 3D printing.
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB: TONE & LIGHT
              ============================================================== */}
          {tab === 'tone' && (
            <div className="space-y-4">
              <div>
                <div className="section-kicker">Image Adjustments</div>
                <div className="inset-panel">
                  <Slider
                    label="Contrast"
                    min={-30}
                    max={35}
                    step={1}
                    value={settings.contrast}
                    display={`${settings.contrast > 0 ? '+' : ''}${settings.contrast}%`}
                    onChange={(value) => onUpdateSettings({ contrast: value })}
                  />
                  <div className="panel-row">
                    <Slider
                      label="Brightness"
                      min={-30}
                      max={30}
                      step={1}
                      value={settings.brightness}
                      display={`${settings.brightness > 0 ? '+' : ''}${settings.brightness}%`}
                      onChange={(value) => onUpdateSettings({ brightness: value })}
                    />
                  </div>
                  <div className="panel-row flex items-center justify-between gap-4 px-3 py-3">
                    <div>
                      <span className="text-xs font-medium text-slate-200 block">Invert Colors</span>
                      <span className="text-[11px] text-slate-400 font-mono">Swap light and dark areas</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Invert"
                      aria-checked={settings.invert}
                      data-on={settings.invert}
                      onClick={() => onUpdateSettings({ invert: !settings.invert })}
                      className="switch-control"
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed font-mono px-1">
                Thinner plastic lets light pass through for highlights, while thicker plastic creates shadows.
              </div>
            </div>
          )}
        </div>

        {/* Dock Footer Actions */}
        <div className="sheet-footer">
          <button
            type="button"
            onClick={onOpenExport}
            className="btn-primary w-full"
          >
            <Download className="w-4 h-4" />
            <span>Export 3D Model</span>
          </button>

          <div className="dock-links">
            <button
              type="button"
              onClick={onResetSettings}
              className="btn-ghost text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Settings</span>
            </button>
            <button
              type="button"
              onClick={onOpenSlicingGuide}
              className="btn-ghost text-xs"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Print Guide</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
