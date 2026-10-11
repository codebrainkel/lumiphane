import React, { useState } from 'react';
import {
  LithophaneSettings,
  SamplePresetImage,
  SupportType,
} from '../types/lithophane';
import { SAMPLE_IMAGES } from '../constants/presets';
import {
  ChevronDown,
  Crop as CropIcon,
  Download,
  HelpCircle,
  Image as ImageIcon,
  RotateCcw,
  SlidersHorizontal,
  SunMedium,
} from 'lucide-react';

interface ControlPanelProps {
  settings: LithophaneSettings;
  activeImageId: string;
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

type EditorTab = 'photo' | 'shape' | 'tone';

const TABS: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
  { id: 'photo', label: 'Photo', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'shape', label: 'Shape', icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: 'tone', label: 'Tone', icon: <SunMedium className="h-4 w-4" /> },
];

const BASES: { id: SupportType; label: string; hint: string }[] = [
  { id: 'flange', label: 'Flange', hint: 'Wide foot' },
  { id: 'buttress', label: 'Fins', hint: 'Side braces' },
  { id: 'full', label: 'Full', hint: 'Solid plinth' },
  { id: 'none', label: 'None', hint: 'Plate only' },
];

function aspectLabel(aspectRatio: number) {
  if (aspectRatio >= 1.05) return `${aspectRatio.toFixed(2)}:1 landscape`;
  if (aspectRatio <= 0.95) return `${aspectRatio.toFixed(2)}:1 portrait`;
  return 'Square';
}

function prettyName(id: string) {
  const known = SAMPLE_IMAGES.find((sample) => sample.id === id);
  if (known) return known.name;
  const cleaned = id.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'Your photo';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="font-mono text-sm tabular-nums text-white">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="editor-range"
        aria-label={label}
      />
    </label>
  );
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  settings,
  activeImageId,
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
  const [tab, setTab] = useState<EditorTab>('photo');
  const [open, setOpen] = useState(true);

  const selectTab = (next: EditorTab) => {
    setTab(next);
    setOpen(true);
  };

  return (
    <aside
      className={`relative z-20 flex w-full min-h-0 shrink-0 flex-col overflow-hidden rounded-t-[28px] border-t border-white/10 bg-[#101218] shadow-[0_-24px_80px_rgba(0,0,0,0.45)] md:h-full md:max-h-full md:w-[340px] md:rounded-none md:border-t-0 md:border-l md:shadow-none lg:w-[380px] ${
        open ? 'h-[min(52dvh,480px)]' : 'h-[76px]'
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.04] to-transparent" />

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-7 w-full items-center justify-center md:hidden"
        aria-expanded={open}
        aria-label={open ? 'Collapse editor' : 'Expand editor'}
      >
        <ChevronDown
          className={`h-4 w-4 text-zinc-500 transition ${open ? '' : 'rotate-180'}`}
        />
      </button>

      <div className="relative px-3 pb-2 md:pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/30 p-1">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`sheet-scroll relative min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-2 ${
          open ? 'flex' : 'hidden md:flex'
        }`}
      >
        {tab === 'photo' && (
          <div className="space-y-4 pb-2">
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-black/40">
                  <ImageIcon className="h-5 w-5 text-zinc-500" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {prettyName(activeImageId)}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">{aspectLabel(aspectRatio)}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={onUploadClick}
                    className="h-9 flex-1 rounded-xl bg-white/10 text-xs font-semibold text-white transition hover:bg-white/15"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={onOpenCrop}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#f0c36a]/15 text-xs font-semibold text-[#f6d48a] transition hover:bg-[#f0c36a]/25"
                  >
                    <CropIcon className="h-3.5 w-3.5" />
                    Crop
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-zinc-200">Sample photos</div>
              <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
                {SAMPLE_IMAGES.map((sample) => {
                  const selected = activeImageId === sample.id;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => onSelectSample(sample)}
                      className="w-[76px] shrink-0 text-left"
                    >
                      <img
                        src={sample.url}
                        alt={sample.name}
                        className={`aspect-square w-full rounded-2xl object-cover ${
                          selected ? 'ring-2 ring-white' : 'ring-1 ring-white/10'
                        }`}
                      />
                      <span
                        className={`mt-1.5 block truncate text-center text-xs ${
                          selected ? 'font-semibold text-white' : 'text-zinc-400'
                        }`}
                      >
                        {sample.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'shape' && (
          <div className="space-y-5 pb-3">
            <div>
              <div className="mb-2 text-sm font-medium text-zinc-200">Form</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ shape: 'flat' })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    settings.shape === 'flat'
                      ? 'border-white bg-white text-zinc-950'
                      : 'border-white/10 bg-white/[0.03] text-white'
                  }`}
                >
                  <div className="text-sm font-semibold">Flat plate</div>
                  <div className={`mt-0.5 text-xs ${settings.shape === 'flat' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Standing panel
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ shape: 'curved', curveAngle: 75 })}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    settings.shape === 'curved'
                      ? 'border-white bg-white text-zinc-950'
                      : 'border-white/10 bg-white/[0.03] text-white'
                  }`}
                >
                  <div className="text-sm font-semibold">Curved arc</div>
                  <div className={`mt-0.5 text-xs ${settings.shape === 'curved' ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Lamp-style wrap
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-medium text-zinc-200">Size</span>
                <span className="font-mono text-sm tabular-nums text-white">
                  {settings.width} × {settings.height} mm
                </span>
              </div>
              <Slider
                label="Width"
                value={settings.width}
                min={60}
                max={220}
                step={5}
                display={`${settings.width} mm`}
                onChange={onUpdateWidth}
              />
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[80, 120, 160, 200].map((width) => {
                  const active = Math.abs(settings.width - width) < 4;
                  return (
                    <button
                      key={width}
                      type="button"
                      onClick={() => onUpdateWidth(width)}
                      className={`h-11 rounded-xl text-sm font-semibold tabular-nums transition ${
                        active
                          ? 'bg-white text-zinc-950'
                          : 'bg-white/[0.05] text-zinc-300 hover:bg-white/10'
                      }`}
                    >
                      {width}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-zinc-200">Base</div>
              <div className="grid grid-cols-2 gap-2">
                {BASES.map((base) => {
                  const active = (settings.supportType || 'flange') === base.id;
                  return (
                    <button
                      key={base.id}
                      type="button"
                      onClick={() => onUpdateSettings({ supportType: base.id })}
                      className={`rounded-2xl px-3 py-2.5 text-left transition ${
                        active ? 'bg-white text-zinc-950' : 'bg-white/[0.05] text-white'
                      }`}
                    >
                      <div className="text-sm font-semibold">{base.label}</div>
                      <div className={`text-xs ${active ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        {base.hint}
                      </div>
                    </button>
                  );
                })}
              </div>

              {settings.supportType !== 'none' && (
                <div className="mt-4 space-y-3">
                  <Slider
                    label="Footprint"
                    value={settings.supportBaseDepth ?? 14}
                    min={6}
                    max={26}
                    step={1}
                    display={`${settings.supportBaseDepth ?? 14} mm`}
                    onChange={(value) => onUpdateSettings({ supportBaseDepth: value })}
                  />
                  <Slider
                    label="Taper"
                    value={settings.supportHeight ?? 8}
                    min={3}
                    max={16}
                    step={1}
                    display={`${settings.supportHeight ?? 8} mm`}
                    onChange={(value) => onUpdateSettings({ supportHeight: value })}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'tone' && (
          <div className="space-y-5 pb-3">
            <p className="text-sm leading-relaxed text-zinc-400">
              Dark areas print thicker. Bright areas stay thin so the lamp glows through.
            </p>
            <Slider
              label="Contrast"
              value={settings.contrast}
              min={-30}
              max={35}
              step={1}
              display={`${settings.contrast > 0 ? '+' : ''}${settings.contrast}%`}
              onChange={(value) => onUpdateSettings({ contrast: value })}
            />
            <Slider
              label="Brightness"
              value={settings.brightness}
              min={-30}
              max={30}
              step={1}
              display={`${settings.brightness > 0 ? '+' : ''}${settings.brightness}%`}
              onChange={(value) => onUpdateSettings({ brightness: value })}
            />
            <button
              type="button"
              role="switch"
              aria-checked={settings.invert}
              onClick={() => onUpdateSettings({ invert: !settings.invert })}
              className="flex w-full items-center justify-between rounded-2xl bg-white/[0.04] px-3.5 py-3 text-left"
            >
              <span>
                <span className="block text-sm font-medium text-white">Invert tones</span>
                <span className="mt-0.5 block text-xs text-zinc-400">Swap highlights and shadows</span>
              </span>
              <span
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  settings.invert ? 'bg-[#f0c36a]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-zinc-950 transition ${
                    settings.invert ? 'left-5' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        )}
      </div>

      <div
        className={`relative border-t border-white/8 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
          open ? 'block' : 'hidden md:block'
        }`}
      >
        <button
          type="button"
          onClick={onOpenExport}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#f0c36a] text-sm font-semibold text-zinc-950 transition active:scale-[0.99] hover:bg-[#f6d48a]"
        >
          <Download className="h-4 w-4" />
          Export lithophane
        </button>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onResetSettings}
            className="inline-flex h-9 items-center gap-1.5 px-1 text-xs font-medium text-zinc-400 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={onOpenSlicingGuide}
            className="inline-flex h-9 items-center gap-1.5 px-1 text-xs font-medium text-zinc-400 hover:text-white"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Print guide
          </button>
        </div>
      </div>
    </aside>
  );
};
