import React, { useEffect, useRef, useState } from 'react';
import {
  BorderIcon,
  LithophaneSettings,
  SupportType,
  CylinderSlot,
} from '../types/lithophane';
import {
  getMultiPanelSlotLabels,
  getStripLayoutsForCount,
  resolveStripLayout,
  StripLayoutPreset,
} from '../constants/presets';
import { BORDER_ICON_MIN_WIDTH_MM, maxBorderWidthMm } from '../services/borderIcons';
import {
  Contrast,
  Crop as CropIcon,
  Frame,
  GripVertical,
  HelpCircle,
  Images,
  Printer,
  Move,
  PanelBottom,
  RotateCcw,
  Ruler,
  Sparkles,
  Upload,
} from 'lucide-react';

interface ControlPanelProps {
  settings: LithophaneSettings;
  onUpdateSettings: (newSettings: Partial<LithophaneSettings>) => void;
  onUpdateWidth: (width: number) => void;
  onResetSettings: () => void;
  onOpenCrop: () => void;
  onUploadClick: () => void;
  onOpenSlicingGuide: () => void;
  aspectRatio: number;
  previewDataUrl: string | null;

  cylinderSlots?: CylinderSlot[];
  onOpenCropSlot?: (slotId: string) => void;
  onUploadSlotClick?: (slotId: string) => void;
  onReorderCylinderSlots?: (newSlots: CylinderSlot[]) => void;
  onMatchCylinderHeightToPhoto?: () => void;
  onPlacePhotos?: () => void;
  printOrderingEnabled?: boolean;
  orderReady?: boolean;
  onOrderPrint?: () => void;
}

type PanelTab = 'photo' | 'size' | 'border' | 'stand' | 'tone';

const TABS: { id: PanelTab; label: string; short: string; icon: typeof Images }[] = [
  { id: 'photo', label: 'Photos', short: 'Photos', icon: Images },
  { id: 'size', label: 'Dimensions', short: 'Size', icon: Ruler },
  { id: 'border', label: 'Border', short: 'Border', icon: Frame },
  { id: 'stand', label: 'Base stand', short: 'Stand', icon: PanelBottom },
  { id: 'tone', label: 'Image adjust', short: 'Adjust', icon: Contrast },
];

function LayoutGlyph({ preset }: { preset: StripLayoutPreset }) {
  const size = 24;
  const pad = 1;
  const gap = 1.6;
  const inner = size - pad * 2;
  const unitW = inner / preset.gridCols;
  const unitH = inner / preset.gridRows;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden="true">
      {preset.cells.map((block, index) => {
        const x = pad + block.col * unitW + gap / 2;
        const y = pad + block.row * unitH + gap / 2;
        const w = Math.max(1.5, block.colSpan * unitW - gap);
        const h = Math.max(1.5, block.rowSpan * unitH - gap);
        return <rect key={index} x={x} y={y} width={w} height={h} rx="1.15" fill="currentColor" />;
      })}
    </svg>
  );
}

const BORDER_MOTIFS: { id: BorderIcon; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'heart', label: 'Heart' },
  { id: 'bone', label: 'Bone' },
  { id: 'star', label: 'Star' },
];

function BorderMotifIcon({ motif }: { motif: BorderIcon }) {
  if (motif === 'heart') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 13.4C4.2 10.7 2.6 8.6 2.6 6.5 2.6 4.8 3.8 3.6 5.4 3.6c1 0 1.8.5 2.6 1.5.8-1 1.6-1.5 2.6-1.5 1.6 0 2.8 1.2 2.8 2.9 0 2.1-1.6 4.2-5.4 6.9z"
        />
      </svg>
    );
  }
  if (motif === 'bone') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <g fill="currentColor">
          <rect x="4.6" y="6.5" width="6.8" height="3" rx="0.6" />
          <circle cx="4.5" cy="6.7" r="1.55" />
          <circle cx="4.5" cy="9.3" r="1.55" />
          <circle cx="11.5" cy="6.7" r="1.55" />
          <circle cx="11.5" cy="9.3" r="1.55" />
        </g>
      </svg>
    );
  }
  if (motif === 'star') {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.6l1.55 3.55 3.85.4-2.9 2.55.85 3.8L8 10.1l-3.35 1.8.85-3.8-2.9-2.55 3.85-.4z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

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
  onOpenCrop,
  onUploadClick,
  onOpenSlicingGuide,
  aspectRatio,
  previewDataUrl,

  cylinderSlots = [],
  onOpenCropSlot,
  onUploadSlotClick,
  onReorderCylinderSlots,
  onMatchCylinderHeightToPhoto,
  onPlacePhotos,
  printOrderingEnabled = false,
  orderReady = false,
  onOrderPrint,
}) => {
  const [tab, setTab] = useState<PanelTab>('photo');
  const [open, setOpen] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const dragTo = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCylinder = settings.shape === 'cylinder';
  const isCube = settings.shape === 'cube';
  const isStrip = settings.shape === 'flat' || settings.shape === 'curved';
  const borderMax = maxBorderWidthMm(settings.shape, settings.width, settings.height);
  const borderIcon = settings.borderIcon ?? 'none';
  const photoCount = cylinderSlots.length;
  const stripLayout = isStrip ? resolveStripLayout(settings.stripLayout, photoCount) : null;
  const layoutChoices = isStrip && photoCount > 1 ? getStripLayoutsForCount(photoCount) : [];
  const photosMoved = cylinderSlots.some(
    (slot) => Math.abs(slot.offsetX ?? 0) > 0.001 || Math.abs(slot.offsetY ?? 0) > 0.001
  );
  const placePhotosButton = onPlacePhotos ? (
    <button
      type="button"
      className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-[#090c12] px-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:text-white"
      onClick={onPlacePhotos}
    >
      <Move className="h-3.5 w-3.5 text-amber-400" />
      <span>Place photos</span>
      {photosMoved && <span className="placement-dot" aria-hidden="true" />}
    </button>
  ) : null;

  const handleReorderSlots = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= cylinderSlots.length ||
      toIdx >= cylinderSlots.length
    ) {
      return;
    }
    const next = [...cylinderSlots];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const labels = getMultiPanelSlotLabels(settings.shape, next.length, settings.stripLayout);
    onReorderCylinderSlots?.(
      next.map((slot, index) => ({
        ...slot,
        label: labels[index]?.deg
          ? `${labels[index].label} (${labels[index].deg})`
          : labels[index]?.label || slot.label,
      }))
    );
  };

  const startPhotoDrag = (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    dragFrom.current = index;
    dragTo.current = index;
    setDragIndex(index);
    setOverIndex(index);

    const pointToIndex = (ev: PointerEvent) => {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = target?.closest('[data-photo-row]');
      if (!row) return;
      const next = Number((row as HTMLElement).dataset.photoRow);
      if (Number.isNaN(next)) return;
      dragTo.current = next;
      setOverIndex(next);
    };
    const move = (ev: PointerEvent) => pointToIndex(ev);
    const finish = (ev: PointerEvent) => {
      pointToIndex(ev);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const from = dragFrom.current;
      const to = dragTo.current;
      dragFrom.current = null;
      dragTo.current = null;
      setDragIndex(null);
      setOverIndex(null);
      if (from !== null && to !== null && from !== to) handleReorderSlots(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

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
          {TABS.map((item) => {
            const Icon = item.icon;
            const selected = showBody && tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={selected}
                aria-controls="adjust-panel"
                aria-label={item.label}
                title={item.label}
                data-on={selected}
                className="dock-tab"
                onClick={() => selectTab(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.short}</span>
              </button>
            );
          })}
        </div>
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
              <div className="space-y-3">
                  {placePhotosButton && layoutChoices.length === 0 && (
                    <div className="flex justify-end">{placePhotosButton}</div>
                  )}
                  {layoutChoices.length > 0 && stripLayout && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-mono text-slate-400">Layout</div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Photo layout">
                          {layoutChoices.map((preset) => {
                            const selected = preset.id === stripLayout.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                aria-label={preset.label}
                                aria-pressed={selected}
                                onClick={() => onUpdateSettings({ stripLayout: preset.id })}
                                className={`flex h-9 w-9 items-center justify-center rounded-md border p-1 transition-colors ${
                                  selected
                                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                                    : 'border-white/10 bg-[#090c12] text-slate-500 hover:border-white/25 hover:text-slate-200'
                                }`}
                              >
                                <LayoutGlyph preset={preset} />
                              </button>
                            );
                          })}
                        </div>
                        {placePhotosButton}
                      </div>
                    </div>
                  )}

                  {isStrip && photoCount === 1 ? (
                /* One photo on a flat or curved panel */
                <div className="space-y-3">
                  <div className="inset-panel p-3">
                    <div className="flex items-center gap-3">
                      {cylinderSlots[0]?.imageSrc && previewDataUrl ? (
                        <img
                          src={previewDataUrl}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover object-center bg-black shrink-0 border border-white/10"
                        />
                      ) : cylinderSlots[0]?.imageSrc ? (
                        <img
                          src={cylinderSlots[0].imageSrc}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover object-center bg-black shrink-0 border border-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-black/40 shrink-0 border border-dashed border-white/15" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {cylinderSlots[0]?.name || 'No photo yet'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {cylinderSlots[0]?.imageSrc ? aspectLabel : 'Add a photo to preview'}
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
                        <span>{cylinderSlots[0]?.imageSrc ? 'Replace' : 'Add photo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onOpenCrop}
                        disabled={!cylinderSlots[0]?.imageSrc}
                        className="btn-secondary text-xs py-1.5 disabled:opacity-40"
                      >
                        <CropIcon className="w-3.5 h-3.5" />
                        <span>Crop</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {!isStrip && photoCount === 1 && onMatchCylinderHeightToPhoto && (
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
                      const labels = getMultiPanelSlotLabels(
                        settings.shape,
                        cylinderSlots.length,
                        settings.stripLayout
                      );
                      const labelInfo = labels[idx] || { label: `Side ${idx + 1}`, deg: '' };
                      const isDragging = dragIndex === idx;
                      const isOver = overIndex === idx && dragIndex !== null && dragIndex !== idx;
                      return (
                        <div
                          key={slot.id}
                          data-photo-row={idx}
                          className={`flex items-center justify-between p-2 rounded-md bg-[#141924] border text-xs ${
                            isOver
                              ? 'border-amber-400'
                              : isDragging
                              ? 'border-white/10 opacity-45'
                              : 'border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {photoCount > 1 && (
                              <button
                                type="button"
                                className="shrink-0 cursor-grab touch-none rounded-xs p-0.5 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
                                aria-label={`Drag to reorder ${labelInfo.label}`}
                                title="Drag to reorder"
                                onPointerDown={(event) => startPhotoDrag(idx, event)}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowUp' && idx > 0) {
                                    event.preventDefault();
                                    handleReorderSlots(idx, idx - 1);
                                  }
                                  if (event.key === 'ArrowDown' && idx < cylinderSlots.length - 1) {
                                    event.preventDefault();
                                    handleReorderSlots(idx, idx + 1);
                                  }
                                }}
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {slot.imageSrc ? (
                              <img
                                src={slot.imageSrc}
                                alt=""
                                draggable={false}
                                className="w-8 h-8 rounded-xs object-cover object-center bg-black shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-xs bg-black/40 shrink-0 border border-dashed border-white/15" />
                            )}
                            <div className="truncate">
                              <div className="font-medium text-white truncate flex items-center gap-1.5">
                                <span>{labelInfo.label}</span>
                                {labelInfo.deg && (
                                  <span className="text-[10px] text-amber-400 font-mono font-bold">{labelInfo.deg}</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono truncate">
                                {slot.name || 'No photo yet'}
                              </div>
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
                              disabled={!slot.imageSrc}
                              className="btn-secondary text-xs px-2 py-1 min-h-[26px] disabled:opacity-40"
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
                </div>
                  )}
                </div>
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

          {tab === 'border' && (
            <div className="space-y-4">
              <div>
                <div className="section-kicker">Border</div>
                <div className="inset-panel">
                  <Slider
                    label="Width"
                    min={1.5}
                    max={borderMax}
                    step={0.5}
                    value={Math.min(borderMax, Math.max(1.5, settings.frameWidth))}
                    display={`${Math.min(borderMax, Math.max(1.5, settings.frameWidth)).toFixed(1)} mm`}
                    onChange={(val) => onUpdateSettings({ frameWidth: val, hasFrame: true })}
                  />
                  <div className="panel-row px-3 py-2.5">
                    <div className="slider-meta">
                      <span>Icon</span>
                    </div>
                    <div className="seg-grid grid-cols-4">
                      {BORDER_MOTIFS.map((motif) => (
                        <button
                          key={motif.id}
                          type="button"
                          data-on={borderIcon === motif.id}
                          aria-label={`${motif.label} border icon`}
                          className="seg-btn flex-col gap-0.5 py-1.5 min-h-[46px]"
                          onClick={() => {
                            const patch: Partial<LithophaneSettings> = {
                              borderIcon: motif.id,
                              hasFrame: true,
                            };
                            if (motif.id !== 'none' && settings.frameWidth < BORDER_ICON_MIN_WIDTH_MM) {
                              patch.frameWidth = Math.min(borderMax, BORDER_ICON_MIN_WIDTH_MM);
                            }
                            onUpdateSettings(patch);
                          }}
                        >
                          <BorderMotifIcon motif={motif.id} />
                          <span>{motif.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-slate-400">
                      Repeats one icon along the middle of the border.
                    </p>
                  </div>
                </div>
              </div>
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
          {printOrderingEnabled && (
            <button
              type="button"
              onClick={onOrderPrint}
              disabled={!orderReady}
              title={orderReady ? 'Order a physical print through Treatstock' : 'Wait for the model to finish'}
              className="btn-secondary mb-2 w-full"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Order a print</span>
            </button>
          )}
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
