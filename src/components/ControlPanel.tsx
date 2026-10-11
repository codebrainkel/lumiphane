import React, { useEffect, useRef, useState } from 'react';
import {
  LithophaneSettings,
  SamplePresetImage,
  SupportType,
} from '../types/lithophane';
import { SAMPLE_IMAGES } from '../constants/presets';
import { ChevronDown, Crop as CropIcon, Download, HelpCircle } from 'lucide-react';

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
  activeSampleId: string;
}

type PanelTab = 'photo' | 'size' | 'stand' | 'tone';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'size', label: 'Size' },
  { id: 'stand', label: 'Stand' },
  { id: 'tone', label: 'Tone' },
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
  const pct = ((value - min) / (max - min)) * 100;
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
  onUploadClick,
  onOpenExport,
  onOpenSlicingGuide,
  aspectRatio,
  previewDataUrl,
  activeSampleId,
}) => {
  const [tab, setTab] = useState<PanelTab>('photo');
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);

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
      ? `${aspectRatio.toFixed(2)} : 1 landscape`
      : aspectRatio <= 0.95
        ? `${aspectRatio.toFixed(2)} : 1 portrait`
        : 'Square';

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
      <div className="dock-bar">
        <div className="seg dock-tabs" role="tablist" aria-label="Adjust">
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
          <ChevronDown className="w-5 h-5" />
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
          {tab === 'photo' && (
            <>
              <div className="inset-group">
                <div className="flex items-center gap-3 p-3">
                  {previewDataUrl ? (
                    <img
                      src={previewDataUrl}
                      alt=""
                      className="w-14 h-14 rounded-[12px] object-cover bg-black shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-[12px] bg-black/50 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[17px] font-medium tracking-[-0.02em] leading-tight">
                      Current photo
                    </div>
                    <div className="text-[13px] text-[#8E8E93] mt-0.5 capitalize">{aspectLabel}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  <button type="button" onClick={onUploadClick} className="btn-quiet">
                    Replace
                  </button>
                  <button type="button" onClick={onOpenCrop} className="btn-tint inline-flex items-center justify-center gap-1.5">
                    <CropIcon className="w-4 h-4" />
                    Crop
                  </button>
                </div>
                <div className="sample-row hairline">
                  {SAMPLE_IMAGES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => onSelectSample(sample)}
                      data-on={activeSampleId === sample.id}
                      className="sample-card"
                    >
                      <img src={sample.url} alt={sample.name} />
                      <span className="mt-1.5 block text-[11px] text-[#8E8E93] truncate">{sample.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'size' && (
            <>
              <div className="kicker">Shape</div>
              <div className="inset-group p-3">
                <div className="seg grid-cols-2">
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

              <div className="kicker">Width</div>
              <div className="inset-group">
                <Slider
                  label="Width"
                  min={60}
                  max={220}
                  step={5}
                  value={settings.width}
                  display={`${settings.width} × ${settings.height} mm`}
                  onChange={onUpdateWidth}
                />
                <div className="chip-row">
                  {[80, 120, 160, 200].map((width) => (
                    <button
                      key={width}
                      type="button"
                      data-on={Math.abs(settings.width - width) < 4}
                      onClick={() => onUpdateWidth(width)}
                      className="chip"
                    >
                      {width}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'stand' && (
            <div className="inset-group">
              <div className="p-3">
                <div className="seg grid-cols-4">
                  {(
                    [
                      { id: 'flange', label: 'Flange' },
                      { id: 'buttress', label: 'Fins' },
                      { id: 'full', label: 'Full' },
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
                <div className="hairline">
                  <Slider
                    label="Footprint"
                    min={6}
                    max={26}
                    step={1}
                    value={settings.supportBaseDepth ?? 14}
                    display={`${settings.supportBaseDepth ?? 14} mm`}
                    onChange={(value) => onUpdateSettings({ supportBaseDepth: value })}
                  />
                  <Slider
                    label="Taper"
                    min={3}
                    max={16}
                    step={1}
                    value={settings.supportHeight ?? 8}
                    display={`${settings.supportHeight ?? 8} mm`}
                    onChange={(value) => onUpdateSettings({ supportHeight: value })}
                  />
                </div>
              )}
            </div>
          )}

          {tab === 'tone' && (
            <div className="inset-group">
              <Slider
                label="Contrast"
                min={-30}
                max={35}
                step={1}
                value={settings.contrast}
                display={`${settings.contrast > 0 ? '+' : ''}${settings.contrast}%`}
                onChange={(value) => onUpdateSettings({ contrast: value })}
              />
              <Slider
                label="Brightness"
                min={-30}
                max={30}
                step={1}
                value={settings.brightness}
                display={`${settings.brightness > 0 ? '+' : ''}${settings.brightness}%`}
                onChange={(value) => onUpdateSettings({ brightness: value })}
              />
              <div className="hairline flex items-center justify-between gap-4 px-3.5 min-h-[52px]">
                <span className="text-[15px] tracking-[-0.02em]">Invert</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Invert"
                  aria-checked={settings.invert}
                  data-on={settings.invert}
                  onClick={() => onUpdateSettings({ invert: !settings.invert })}
                  className="switch"
                >
                  <span />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sheet-footer">
          <button type="button" onClick={onOpenExport} className="btn-fill w-full">
            <Download className="w-[18px] h-[18px]" />
            Export
          </button>
          <div className="dock-links">
            <button type="button" onClick={onResetSettings} className="text-btn">
              Reset
            </button>
            <button type="button" onClick={onOpenSlicingGuide} className="text-btn">
              <HelpCircle className="w-4 h-4" />
              Slicing guide
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
