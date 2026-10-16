import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImageCropData } from '../types/lithophane';
import {
  Check,
  X,
  Crop as CropIcon,
  RotateCcw,
  Maximize,
  Move,
} from 'lucide-react';

interface CropModalProps {
  imageSrc: string;
  initialCrop: ImageCropData | null;
  physicalWidthMm?: number;
  targetAspect?: number;
  targetAspectLabel?: string;
  onApplyCrop: (crop: ImageCropData | null) => void;
  onClose: () => void;
}

type DragMode = 'none' | 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

interface AspectPreset {
  id: ImageCropData['aspectRatioMode'];
  label: string;
  ratio: number | null;
}

const PRESETS: AspectPreset[] = [
  { id: 'original', label: 'Full Image', ratio: null },
  { id: '1:1', label: '1:1 Square', ratio: 1.0 },
  { id: '4:3', label: '4:3 Standard', ratio: 4 / 3 },
  { id: '3:4', label: '3:4 Portrait', ratio: 3 / 4 },
  { id: '3:2', label: '3:2 Photo', ratio: 3 / 2 },
  { id: '2:3', label: '2:3 Portrait', ratio: 2 / 3 },
  { id: '16:9', label: '16:9 Wide', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 Tall', ratio: 9 / 16 },
  { id: 'custom', label: 'Freeform', ratio: null },
];

export const CropModal: React.FC<CropModalProps> = ({
  imageSrc,
  initialCrop,
  physicalWidthMm = 120,
  targetAspect,
  targetAspectLabel,
  onApplyCrop,
  onClose,
}) => {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [aspectMode, setAspectMode] = useState<ImageCropData['aspectRatioMode']>(
    initialCrop?.aspectRatioMode || 'original'
  );
  const [cropRect, setCropRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: 380,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    initialCrop: { x: number; y: number; width: number; height: number };
  }>({
    mode: 'none',
    startX: 0,
    startY: 0,
    initialCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Load natural image dimensions
  useEffect(() => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      setNaturalSize({ width: nw, height: nh });

      if (initialCrop) {
        setCropRect({
          x: Math.max(0, Math.min(nw - 10, Math.round(initialCrop.x))),
          y: Math.max(0, Math.min(nh - 10, Math.round(initialCrop.y))),
          width: Math.max(10, Math.min(nw, Math.round(initialCrop.width))),
          height: Math.max(10, Math.min(nh, Math.round(initialCrop.height))),
        });
        setAspectMode(initialCrop.aspectRatioMode);
      } else {
        setCropRect({
          x: 0,
          y: 0,
          width: nw,
          height: nh,
        });
        setAspectMode('original');
      }
    };
  }, [imageSrc, initialCrop]);

  // Track container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const getImageRenderBounds = useCallback(() => {
    if (!naturalSize.width || !naturalSize.height || !containerSize.width || !containerSize.height) {
      return { x: 0, y: 0, width: 0, height: 0, scale: 1 };
    }

    const pad = 16;
    const availW = Math.max(50, containerSize.width - pad * 2);
    const availH = Math.max(50, containerSize.height - pad * 2);

    const naturalRatio = naturalSize.width / naturalSize.height;
    const containerRatio = availW / availH;

    let renderW = availW;
    let renderH = availH;

    if (naturalRatio > containerRatio) {
      renderW = availW;
      renderH = availW / naturalRatio;
    } else {
      renderH = availH;
      renderW = availH * naturalRatio;
    }

    const renderX = (containerSize.width - renderW) / 2;
    const renderY = (containerSize.height - renderH) / 2;
    const scale = renderW / naturalSize.width;

    return {
      x: renderX,
      y: renderY,
      width: renderW,
      height: renderH,
      scale,
    };
  }, [naturalSize, containerSize]);

  const setPresetRatio = (mode: ImageCropData['aspectRatioMode']) => {
    setAspectMode(mode);
    if (!naturalSize.width || !naturalSize.height) return;

    const nw = naturalSize.width;
    const nh = naturalSize.height;

    if (mode === 'original') {
      setCropRect({ x: 0, y: 0, width: nw, height: nh });
      return;
    }

    if (mode === 'custom') return;

    const preset = PRESETS.find((p) => p.id === mode);
    if (!preset || !preset.ratio) return;

    const targetRatio = preset.ratio;
    let cropW = nw;
    let cropH = nw / targetRatio;

    if (cropH > nh) {
      cropH = nh;
      cropW = nh * targetRatio;
    }

    const cropX = Math.round((nw - cropW) / 2);
    const cropY = Math.round((nh - cropH) / 2);

    setCropRect({
      x: Math.max(0, cropX),
      y: Math.max(0, cropY),
      width: Math.min(nw, Math.round(cropW)),
      height: Math.min(nh, Math.round(cropH)),
    });
  };

  const applySpecificRatio = (targetRatio: number, mode: ImageCropData['aspectRatioMode'] = 'custom') => {
    setAspectMode(mode);
    if (!naturalSize.width || !naturalSize.height) return;
    const nw = naturalSize.width;
    const nh = naturalSize.height;
    let cropW = nw;
    let cropH = nw / targetRatio;
    if (cropH > nh) {
      cropH = nh;
      cropW = nh * targetRatio;
    }
    const cropX = Math.round((nw - cropW) / 2);
    const cropY = Math.round((nh - cropH) / 2);
    setCropRect({
      x: Math.max(0, cropX),
      y: Math.max(0, cropY),
      width: Math.min(nw, Math.round(cropW)),
      height: Math.min(nh, Math.round(cropH)),
    });
  };

  const handleCenterCrop = () => {
    if (!naturalSize.width || !naturalSize.height) return;
    const cropX = Math.max(0, Math.round((naturalSize.width - cropRect.width) / 2));
    const cropY = Math.max(0, Math.round((naturalSize.height - cropRect.height) / 2));
    setCropRect((prev) => ({ ...prev, x: cropX, y: cropY }));
  };

  const handleMaximizeCrop = () => {
    if (!naturalSize.width || !naturalSize.height) return;
    setPresetRatio(aspectMode);
  };

  const handleReset = () => {
    setAspectMode('original');
    setCropRect({
      x: 0,
      y: 0,
      width: naturalSize.width,
      height: naturalSize.height,
    });
  };

  const handlePointerDown = (mode: DragMode, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragStartRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...cropRect },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const { mode, startX, startY, initialCrop } = dragStartRef.current;
    if (mode === 'none') return;

    const bounds = getImageRenderBounds();
    if (bounds.scale <= 0) return;

    const deltaDisplayX = e.clientX - startX;
    const deltaDisplayY = e.clientY - startY;
    const deltaX = deltaDisplayX / bounds.scale;
    const deltaY = deltaDisplayY / bounds.scale;

    const nw = naturalSize.width;
    const nh = naturalSize.height;

    if (mode === 'move') {
      let newX = Math.round(initialCrop.x + deltaX);
      let newY = Math.round(initialCrop.y + deltaY);

      newX = Math.max(0, Math.min(nw - initialCrop.width, newX));
      newY = Math.max(0, Math.min(nh - initialCrop.height, newY));

      setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
      return;
    }

    const currentPreset = PRESETS.find((p) => p.id === aspectMode);
    const lockedRatio = currentPreset?.ratio ?? null;

    let { x, y, width, height } = initialCrop;

    if (lockedRatio !== null) {
      if (mode === 'se') {
        let newW = initialCrop.width + deltaX;
        let newH = newW / lockedRatio;
        if (newW > nw - initialCrop.x) {
          newW = nw - initialCrop.x;
          newH = newW / lockedRatio;
        }
        if (newH > nh - initialCrop.y) {
          newH = nh - initialCrop.y;
          newW = newH * lockedRatio;
        }
        width = Math.max(20, Math.round(newW));
        height = Math.max(20, Math.round(newH));
      } else if (mode === 'sw') {
        let newW = initialCrop.width - deltaX;
        let newH = newW / lockedRatio;
        if (newW > initialCrop.x + initialCrop.width) {
          newW = initialCrop.x + initialCrop.width;
          newH = newW / lockedRatio;
        }
        if (newH > nh - initialCrop.y) {
          newH = nh - initialCrop.y;
          newW = newH * lockedRatio;
        }
        width = Math.max(20, Math.round(newW));
        height = Math.max(20, Math.round(newH));
        x = initialCrop.x + initialCrop.width - width;
      } else if (mode === 'ne') {
        let newW = initialCrop.width + deltaX;
        let newH = newW / lockedRatio;
        if (newW > nw - initialCrop.x) {
          newW = nw - initialCrop.x;
          newH = newW / lockedRatio;
        }
        if (newH > initialCrop.y + initialCrop.height) {
          newH = initialCrop.y + initialCrop.height;
          newW = newH * lockedRatio;
        }
        width = Math.max(20, Math.round(newW));
        height = Math.max(20, Math.round(newH));
        y = initialCrop.y + initialCrop.height - height;
      } else if (mode === 'nw') {
        let newW = initialCrop.width - deltaX;
        let newH = newW / lockedRatio;
        if (newW > initialCrop.x + initialCrop.width) {
          newW = initialCrop.x + initialCrop.width;
          newH = newW / lockedRatio;
        }
        if (newH > initialCrop.y + initialCrop.height) {
          newH = initialCrop.y + initialCrop.height;
          newW = newH * lockedRatio;
        }
        width = Math.max(20, Math.round(newW));
        height = Math.max(20, Math.round(newH));
        x = initialCrop.x + initialCrop.width - width;
        y = initialCrop.y + initialCrop.height - height;
      }
    } else {
      if (mode.includes('e')) {
        width = Math.max(20, Math.min(nw - x, Math.round(initialCrop.width + deltaX)));
      }
      if (mode.includes('s')) {
        height = Math.max(20, Math.min(nh - y, Math.round(initialCrop.height + deltaY)));
      }
      if (mode.includes('w')) {
        const potentialW = Math.round(initialCrop.width - deltaX);
        if (potentialW >= 20 && initialCrop.x + deltaX >= 0) {
          width = potentialW;
          x = Math.round(initialCrop.x + deltaX);
        }
      }
      if (mode.includes('n')) {
        const potentialH = Math.round(initialCrop.height - deltaY);
        if (potentialH >= 20 && initialCrop.y + deltaY >= 0) {
          height = potentialH;
          y = Math.round(initialCrop.y + deltaY);
        }
      }
    }

    setCropRect({
      x: Math.max(0, Math.min(nw - 20, x)),
      y: Math.max(0, Math.min(nh - 20, y)),
      width: Math.max(20, Math.min(nw, width)),
      height: Math.max(20, Math.min(nh, height)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current.mode !== 'none') {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragStartRef.current.mode = 'none';
    }
  };

  const handleApply = () => {
    const isFullImage =
      aspectMode === 'original' &&
      cropRect.x <= 2 &&
      cropRect.y <= 2 &&
      Math.abs(cropRect.width - naturalSize.width) <= 2 &&
      Math.abs(cropRect.height - naturalSize.height) <= 2;

    if (isFullImage) {
      onApplyCrop(null);
    } else {
      onApplyCrop({
        x: Math.max(0, Math.round(cropRect.x)),
        y: Math.max(0, Math.round(cropRect.y)),
        width: Math.min(naturalSize.width, Math.round(cropRect.width)),
        height: Math.min(naturalSize.height, Math.round(cropRect.height)),
        aspectRatioMode: aspectMode,
      });
    }
    onClose();
  };

  const bounds = getImageRenderBounds();
  const cropDisplayX = bounds.x + cropRect.x * bounds.scale;
  const cropDisplayY = bounds.y + cropRect.y * bounds.scale;
  const cropDisplayW = cropRect.width * bounds.scale;
  const cropDisplayH = cropRect.height * bounds.scale;

  const currentRatioVal = cropRect.height > 0 ? cropRect.width / cropRect.height : 1.33;
  const projectedHeightMm = Math.max(10, Math.round(physicalWidthMm / currentRatioVal));

  return (
    <div className="modal-scrim select-none">
      <div className="modal-dialog wide">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Crop Photo
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Adjust framing and proportions for your 3D print.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body p-5 flex flex-col gap-4">
          {/* Preset Buttons Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {targetAspect && (
              <button
                type="button"
                onClick={() => applySpecificRatio(targetAspect, 'custom')}
                className="px-3 py-1.5 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors shrink-0 bg-amber-400 text-slate-950 hover:bg-amber-300 border border-amber-300 shadow-xs flex items-center gap-1.5"
                title={`Fit crop exactly to ${targetAspectLabel || 'cylinder sector'} (${targetAspect.toFixed(2)}:1)`}
              >
                <CropIcon className="w-3.5 h-3.5" />
                <span>{targetAspectLabel || `Fit Ratio (${targetAspect.toFixed(2)}:1)`}</span>
              </button>
            )}
            {PRESETS.map((p) => {
              const isActive = aspectMode === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPresetRatio(p.id)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'bg-[#1e2535] text-white border border-white/20 font-semibold'
                      : 'bg-[#141924] text-slate-400 hover:text-slate-200 border border-white/5'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Interactive Visual Canvas / Crop Viewport */}
          <div
            ref={containerRef}
            className="relative bg-[#080a0e] border border-white/10 rounded-md h-[40dvh] min-h-56 sm:h-96 flex items-center justify-center overflow-hidden touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Background Image */}
            {bounds.width > 0 && (
              <img
                src={imageSrc}
                alt="Source"
                className="absolute pointer-events-none select-none"
                style={{
                  left: `${bounds.x}px`,
                  top: `${bounds.y}px`,
                  width: `${bounds.width}px`,
                  height: `${bounds.height}px`,
                }}
              />
            )}

            {/* Dark Mask Top */}
            {bounds.width > 0 && (
              <div
                className="absolute bg-black/75 pointer-events-none"
                style={{
                  left: `${bounds.x}px`,
                  top: `${bounds.y}px`,
                  width: `${bounds.width}px`,
                  height: `${Math.max(0, cropDisplayY - bounds.y)}px`,
                }}
              />
            )}

            {/* Dark Mask Bottom */}
            {bounds.width > 0 && (
              <div
                className="absolute bg-black/75 pointer-events-none"
                style={{
                  left: `${bounds.x}px`,
                  top: `${cropDisplayY + cropDisplayH}px`,
                  width: `${bounds.width}px`,
                  height: `${Math.max(0, bounds.y + bounds.height - (cropDisplayY + cropDisplayH))}px`,
                }}
              />
            )}

            {/* Dark Mask Left */}
            {bounds.width > 0 && (
              <div
                className="absolute bg-black/75 pointer-events-none"
                style={{
                  left: `${bounds.x}px`,
                  top: `${cropDisplayY}px`,
                  width: `${Math.max(0, cropDisplayX - bounds.x)}px`,
                  height: `${cropDisplayH}px`,
                }}
              />
            )}

            {/* Dark Mask Right */}
            {bounds.width > 0 && (
              <div
                className="absolute bg-black/75 pointer-events-none"
                style={{
                  left: `${cropDisplayX + cropDisplayW}px`,
                  top: `${cropDisplayY}px`,
                  width: `${Math.max(0, bounds.x + bounds.width - (cropDisplayX + cropDisplayW))}px`,
                  height: `${cropDisplayH}px`,
                }}
              />
            )}

            {/* Active Highlighted Crop Window */}
            {bounds.width > 0 && cropDisplayW > 0 && cropDisplayH > 0 && (
              <div
                className="absolute border border-amber-400 shadow-xl cursor-move group"
                style={{
                  left: `${cropDisplayX}px`,
                  top: `${cropDisplayY}px`,
                  width: `${cropDisplayW}px`,
                  height: `${cropDisplayH}px`,
                }}
                onPointerDown={(e) => handlePointerDown('move', e)}
              >
                {/* Rule-of-thirds grid */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30 group-hover:opacity-60 transition-opacity">
                  <div className="border-r border-b border-amber-400/30" />
                  <div className="border-r border-b border-amber-400/30" />
                  <div className="border-b border-amber-400/30" />
                  <div className="border-r border-b border-amber-400/30" />
                  <div className="border-r border-b border-amber-400/30" />
                  <div className="border-b border-amber-400/30" />
                  <div className="border-r border-b border-amber-400/30" />
                  <div className="border-r border-b border-amber-400/30" />
                  <div />
                </div>

                {/* Corner Resize Handles */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-white cursor-nwse-resize"
                  onPointerDown={(e) => handlePointerDown('nw', e)}
                />
                <div
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-white cursor-nesw-resize"
                  onPointerDown={(e) => handlePointerDown('ne', e)}
                />
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-white cursor-nwse-resize"
                  onPointerDown={(e) => handlePointerDown('se', e)}
                />
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-white cursor-nesw-resize"
                  onPointerDown={(e) => handlePointerDown('sw', e)}
                />

                {/* Dimension Tooltip */}
                <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded-xs text-[10px] font-mono text-amber-400 font-bold border border-white/10 pointer-events-none">
                  {cropRect.width} × {cropRect.height} px
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics & Utility Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-2.5 rounded-md bg-[#141924] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">
                  Crop Size
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {cropRect.width} × {cropRect.height} px
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Original: {naturalSize.width} × {naturalSize.height}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-[#141924] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">
                  Proportions
                </span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {currentRatioVal.toFixed(2)}:1
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono capitalize">
                {aspectMode}
              </span>
            </div>

            <div className="p-2.5 rounded-md bg-[#141924] border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 font-mono block">
                  3D Dimensions
                </span>
                <span className="text-xs font-mono font-semibold text-white">
                  {physicalWidthMm} × {projectedHeightMm} mm
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                Auto scaled
              </span>
            </div>
          </div>

          {/* Quick Action Tools */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCenterCrop}
                className="btn-secondary text-xs py-1 px-2.5 min-h-[28px]"
              >
                <Move className="w-3 h-3" />
                <span>Center</span>
              </button>
              <button
                onClick={handleMaximizeCrop}
                className="btn-secondary text-xs py-1 px-2.5 min-h-[28px]"
              >
                <Maximize className="w-3 h-3" />
                <span>Fit Image</span>
              </button>
              <button
                onClick={handleReset}
                className="btn-secondary text-xs py-1 px-2.5 min-h-[28px]"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              Drag frame to move · Drag corners to resize
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-white/10 bg-[#10141d]">
          <button
            onClick={onClose}
            className="btn-secondary text-xs py-1.5 px-3 min-h-[32px]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="btn-primary"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Crop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
