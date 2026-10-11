import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImageCropData } from '../types/lithophane';
import {
  Check,
  X,
  Crop as CropIcon,
  RotateCw,
  Maximize,
  Move,
  Layers,
  Sparkles,
} from 'lucide-react';

interface CropModalProps {
  imageSrc: string;
  initialCrop: ImageCropData | null;
  physicalWidthMm?: number;
  onApplyCrop: (crop: ImageCropData | null) => void;
  onClose: () => void;
}

type DragMode = 'none' | 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

interface AspectPreset {
  id: ImageCropData['aspectRatioMode'];
  label: string;
  ratio: number | null; // null for original / custom
  type: 'general' | 'landscape' | 'portrait';
}

const PRESETS: AspectPreset[] = [
  { id: 'original', label: 'Full Image', ratio: null, type: 'general' },
  { id: '1:1', label: '1:1 Square', ratio: 1.0, type: 'general' },
  { id: '4:3', label: '4:3 Standard', ratio: 4 / 3, type: 'landscape' },
  { id: '3:4', label: '3:4 Portrait', ratio: 3 / 4, type: 'portrait' },
  { id: '3:2', label: '3:2 Photo', ratio: 3 / 2, type: 'landscape' },
  { id: '2:3', label: '2:3 Portrait', ratio: 2 / 3, type: 'portrait' },
  { id: '16:9', label: '16:9 Wide', ratio: 16 / 9, type: 'landscape' },
  { id: '9:16', label: '9:16 Tall', ratio: 9 / 16, type: 'portrait' },
  { id: 'custom', label: 'Freeform', ratio: null, type: 'general' },
];

export const CropModal: React.FC<CropModalProps> = ({
  imageSrc,
  initialCrop,
  physicalWidthMm = 120,
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
  // Crop rect in natural image pixels
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

  // Load image dimensions
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

  // Track container size
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

  // Compute rendered image bounds inside preview container (letterboxed object-contain)
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
    const scale = renderW / naturalSize.width; // display pixels per natural pixel

    return {
      x: renderX,
      y: renderY,
      width: renderW,
      height: renderH,
      scale,
    };
  }, [naturalSize, containerSize]);

  // Set preset ratio
  const setPresetRatio = (mode: ImageCropData['aspectRatioMode']) => {
    setAspectMode(mode);
    if (!naturalSize.width || !naturalSize.height) return;

    const nw = naturalSize.width;
    const nh = naturalSize.height;

    if (mode === 'original') {
      setCropRect({ x: 0, y: 0, width: nw, height: nh });
      return;
    }

    if (mode === 'custom') {
      return;
    }

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

  // Pointer drag handling
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

    // Convert display displacement (px) to image pixel space
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

    // Resizing handles
    const currentPreset = PRESETS.find((p) => p.id === aspectMode);
    const lockedRatio = currentPreset?.ratio ?? null;

    let { x, y, width, height } = initialCrop;

    if (lockedRatio !== null) {
      // Locked aspect ratio resize from corners
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
      // Freeform resize
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
    // If full image and uncropped, pass null to avoid unnecessary canvas slice
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#12151f] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0d0f16]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
              <CropIcon className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Image Framing & Aspect Ratio
              </h3>
              <p className="text-[11px] text-slate-400">
                The 3D lithograph dimensions are strictly shaped to match this aspect ratio.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* Preset Buttons Bar */}
          <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#090b10] border border-white/5 rounded-xl">
            <span className="text-[11px] font-medium text-slate-400 px-2 shrink-0">
              Aspect Ratio:
            </span>
            {PRESETS.map((p) => {
              const isActive = aspectMode === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPresetRatio(p.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all shrink-0 ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/[0.06]'
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
            className="relative bg-[#07090e] border border-white/10 rounded-xl h-84 sm:h-96 flex items-center justify-center overflow-hidden touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Background Image */}
            {bounds.width > 0 && (
              <img
                src={imageSrc}
                alt="Framing Source"
                className="absolute pointer-events-none select-none rounded shadow-md"
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
                className="absolute bg-black/65 pointer-events-none"
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
                className="absolute bg-black/65 pointer-events-none"
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
                className="absolute bg-black/65 pointer-events-none"
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
                className="absolute bg-black/65 pointer-events-none"
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
                className="absolute border-2 border-amber-400 shadow-2xl cursor-move group"
                style={{
                  left: `${cropDisplayX}px`,
                  top: `${cropDisplayY}px`,
                  width: `${cropDisplayW}px`,
                  height: `${cropDisplayH}px`,
                }}
                onPointerDown={(e) => handlePointerDown('move', e)}
              >
                {/* Rule-of-thirds grid */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-40 group-hover:opacity-75 transition-opacity">
                  <div className="border-r border-b border-amber-300/40" />
                  <div className="border-r border-b border-amber-300/40" />
                  <div className="border-b border-amber-300/40" />
                  <div className="border-r border-b border-amber-300/40" />
                  <div className="border-r border-b border-amber-300/40" />
                  <div className="border-b border-amber-300/40" />
                  <div className="border-r border-amber-300/40" />
                  <div className="border-r border-amber-300/40" />
                  <div />
                </div>

                {/* Move Hint Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity">
                  <Move className="w-5 h-5 text-amber-300 drop-shadow" />
                </div>

                {/* Corner Resize Handles */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-xs shadow cursor-nwse-resize"
                  onPointerDown={(e) => handlePointerDown('nw', e)}
                />
                <div
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-xs shadow cursor-nesw-resize"
                  onPointerDown={(e) => handlePointerDown('ne', e)}
                />
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-xs shadow cursor-nwse-resize"
                  onPointerDown={(e) => handlePointerDown('se', e)}
                />
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-amber-400 border border-slate-950 rounded-xs shadow cursor-nesw-resize"
                  onPointerDown={(e) => handlePointerDown('sw', e)}
                />

                {/* Edge Handles if Freeform */}
                {aspectMode === 'custom' && (
                  <>
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-1.5 bg-amber-400 border border-slate-950 rounded-xs cursor-ns-resize"
                      onPointerDown={(e) => handlePointerDown('n', e)}
                    />
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-1.5 bg-amber-400 border border-slate-950 rounded-xs cursor-ns-resize"
                      onPointerDown={(e) => handlePointerDown('s', e)}
                    />
                    <div
                      className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-1.5 h-4 bg-amber-400 border border-slate-950 rounded-xs cursor-ew-resize"
                      onPointerDown={(e) => handlePointerDown('w', e)}
                    />
                    <div
                      className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-1.5 h-4 bg-amber-400 border border-slate-950 rounded-xs cursor-ew-resize"
                      onPointerDown={(e) => handlePointerDown('e', e)}
                    />
                  </>
                )}

                {/* Floating Dimension Label */}
                <div className="absolute bottom-1.5 right-2 bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-mono text-amber-300 border border-amber-400/30 pointer-events-none">
                  {cropRect.width} × {cropRect.height} px
                </div>
              </div>
            )}
          </div>

          {/* Quick Tools & Live Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Metric 1: Source & Crop Resolution */}
            <div className="bg-[#090b10] border border-white/5 p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Crop Dimensions
                </span>
                <span className="text-xs font-mono font-medium text-white">
                  {cropRect.width} × {cropRect.height} px
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Source: {naturalSize.width} × {naturalSize.height}
              </span>
            </div>

            {/* Metric 2: Ratio */}
            <div className="bg-[#090b10] border border-white/5 p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                  Aspect Ratio
                </span>
                <span className="text-xs font-mono font-medium text-amber-300">
                  {currentRatioVal.toFixed(2)}:1 ({aspectMode.toUpperCase()})
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {currentRatioVal >= 1.05 ? 'Landscape' : currentRatioVal <= 0.95 ? 'Portrait' : 'Square'}
              </span>
            </div>

            {/* Metric 3: Projected Lithophane Dimensions */}
            <div className="bg-[#090b10] border border-amber-400/20 p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold text-amber-400/80 block">
                  3D Lithograph Size
                </span>
                <span className="text-xs font-mono font-semibold text-amber-300">
                  {physicalWidthMm} × {projectedHeightMm} mm
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                Auto-calculated
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCenterCrop}
                className="flex items-center gap-1.5 hover:text-white transition-colors py-1 px-2 rounded hover:bg-white/5"
              >
                <Move className="w-3.5 h-3.5 text-slate-400" />
                <span>Center</span>
              </button>
              <button
                onClick={handleMaximizeCrop}
                className="flex items-center gap-1.5 hover:text-white transition-colors py-1 px-2 rounded hover:bg-white/5"
              >
                <Maximize className="w-3.5 h-3.5 text-slate-400" />
                <span>Expand to Max</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 hover:text-white transition-colors py-1 px-2 rounded hover:bg-white/5"
              >
                <RotateCw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Full Image</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-500 italic hidden sm:inline">
              Drag inside box to move · Drag corners to resize
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#0d0f16]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md transition-all whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            <span>Apply Framing</span>
          </button>
        </div>
      </div>
    </div>
  );
};
