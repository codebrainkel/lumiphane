import React, { useRef, useState } from 'react';
import { LithophaneShape, CylinderSlot, SamplePresetImage, ImageCropData } from '../types/lithophane';
import {
  SAMPLE_IMAGES,
  getCylinderSlotLabels,
  getCubeSlotLabels,
  getMultiPanelSlotLabels,
  getOptimalMultiPanelWrapRatio,
} from '../constants/presets';
import {
  Upload,
  Crop as CropIcon,
  ArrowRight,
  ArrowLeft,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Sparkles,
  Maximize2,
  Check,
} from 'lucide-react';

interface PhotoUploaderProps {
  shape: LithophaneShape;
  singleImageSrc: string;
  singleImageName: string;
  hasOwnPhoto: boolean;
  onUploadSingleFile: (file: File) => void;
  onSelectSample: (sample: SamplePresetImage) => void;
  onOpenCropSingle: () => void;
  singleCropData: ImageCropData | null;
  singleAspectRatio: number;

  cylinderSlots: CylinderSlot[];
  cylinderDiameter?: number;
  cubeWidth?: number;
  cylinderHeight?: number;
  onUpdateCylinderSlot: (slotId: string, updates: Partial<CylinderSlot>) => void;
  onUploadCylinderSlotFile: (slotId: string, file: File) => void;
  onUploadMultipleFiles: (files: FileList) => void;
  onResetCylinderToDefaults: () => void;
  onOpenCropSlot: (slotId: string) => void;
  onReorderCylinderSlots?: (newSlots: CylinderSlot[]) => void;
  onSetCylinderSlotCount?: (count: number) => void;
  onAddCylinderSlot?: () => void;
  onRemoveCylinderSlot?: (slotId: string) => void;
  onMatchCylinderHeightToPhoto?: () => void;

  onBackToMode: () => void;
  onContinueToPreview: () => void;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  shape,
  singleImageSrc,
  singleImageName,
  hasOwnPhoto,
  onUploadSingleFile,
  onSelectSample,
  onOpenCropSingle,
  singleCropData,
  singleAspectRatio,

  cylinderSlots,
  cylinderDiameter = 90,
  cubeWidth = 90,
  cylinderHeight = 95,
  onUpdateCylinderSlot,
  onUploadCylinderSlotFile,
  onUploadMultipleFiles,
  onOpenCropSlot,
  onReorderCylinderSlots,
  onSetCylinderSlotCount,
  onAddCylinderSlot,
  onRemoveCylinderSlot,
  onMatchCylinderHeightToPhoto,

  onBackToMode,
  onContinueToPreview,
}) => {
  const singleInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);
  const slotInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [draggedSlotIdx, setDraggedSlotIdx] = useState<number | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);
  const [isDraggingOverSingle, setIsDraggingOverSingle] = useState(false);

  const isCylinder = shape === 'cylinder';
  const isCube = shape === 'cube';
  const isMultiPanel = isCylinder || isCube;
  const slotCount = cylinderSlots.length;

  const sizeMm = isCube ? cubeWidth : cylinderDiameter;
  const perimeter = isCube ? 4 * sizeMm : Math.PI * sizeMm;
  const optimalWrapRatio = getOptimalMultiPanelWrapRatio(shape, sizeMm, cylinderHeight, 1);
  const currentSlotOptimalRatio = getOptimalMultiPanelWrapRatio(shape, sizeMm, cylinderHeight, slotCount);

  const formatAspect = (r: number) => {
    if (r >= 1.05) return 'Landscape';
    if (r <= 0.95) return 'Portrait';
    return 'Square';
  };

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
    const newSlots = [...cylinderSlots];
    const [moved] = newSlots.splice(fromIdx, 1);
    newSlots.splice(toIdx, 0, moved);

    const labels = getMultiPanelSlotLabels(shape, newSlots.length);
    const updated = newSlots.map((s, i) => ({
      ...s,
      label: `${labels[i].label} (${labels[i].deg})`,
    }));

    if (onReorderCylinderSlots) {
      onReorderCylinderSlots(updated);
    }
  };

  const labels = getMultiPanelSlotLabels(shape, slotCount);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-6 md:py-10 flex flex-col items-center justify-start pb-28 box-border">
      {/* Hidden native file inputs */}
      <input
        ref={singleInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadSingleFile(file);
        }}
      />
      <input
        ref={multiInputRef}
        type="file"
        multiple
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadMultipleFiles(e.target.files);
          }
        }}
      />

      {/* Header */}
      <div className="text-center max-w-2xl mb-6">
        <div className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono mb-2">
          Step 2 · Add Photos
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {isMultiPanel
            ? slotCount === 1
              ? isCube
                ? '4-Face Cube Wrap'
                : '360° Cylinder Wrap'
              : isCube
                ? `Hollow Cube · ${slotCount} Photos`
                : `Cylinder Lamp · ${slotCount} Photos`
            : 'Choose Your Photo'}
        </h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          {isMultiPanel
            ? slotCount === 1
              ? isCube
                ? 'Wrap a single panoramic photo seamlessly around all 4 sides of the hollow cube.'
                : 'Wrap a single panoramic or landscape photo seamlessly around the entire 360° lamp.'
              : isCube
                ? `Distribute ${slotCount} photos evenly across the sides of your hollow cube lantern.`
                : `Distribute ${slotCount} photos evenly around your 360° cylinder lamp.`
            : 'Upload a photo or choose one of our sample portraits.'}
        </p>
      </div>

      {isMultiPanel ? (
        /* ================================================================
           MULTI-PANEL MODE (CYLINDER / HOLLOW CUBE): 1 TO 4 PHOTOS
           ================================================================ */
        <div className="w-full flex flex-col gap-5">
          {/* Layout Selector: 1, 2, 3, or 4 Photos */}
          <div className="p-3 sm:p-4 bg-[#10141d] border border-white/10 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-col items-start w-full sm:w-auto">
              <span className="text-xs font-bold text-white uppercase font-mono tracking-wide">
                {isCube ? 'Cube Photo Layout' : 'Cylinder Photo Layout'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {slotCount === 1
                  ? isCube
                    ? `Full 4-face wrap (Target: ~${optimalWrapRatio}:1 aspect ratio)`
                    : `Full 360° wrap (Ideal: ~${optimalWrapRatio}:1 aspect ratio)`
                  : `${slotCount} sides (${labels.map((l) => l.deg).join(' · ')})`}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 w-full sm:w-auto bg-[#090c12] p-1 rounded-md border border-white/10">
              {[1, 2, 3, 4].map((count) => {
                const isActive = slotCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onSetCylinderSlotCount?.(count)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all text-center ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {count} {count === 1 ? 'Photo' : 'Photos'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Upload & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#10141d] border border-white/10 rounded-lg">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => multiInputRef.current?.click()}
                className="btn-secondary text-xs py-1.5 px-3 min-h-[32px]"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {slotCount === 1
                    ? isCube
                      ? 'Upload 4-Face Photo'
                      : 'Upload 360° Photo'
                    : `Upload ${slotCount} Photos`}
                </span>
              </button>

              {slotCount < 4 && (
                <button
                  type="button"
                  onClick={onAddCylinderSlot}
                  className="btn-secondary text-xs py-1.5 px-3 min-h-[32px]"
                  title="Add another photo panel"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Side</span>
                </button>
              )}
            </div>

            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span>
                {isCube
                  ? `${sizeMm}mm × ${sizeMm}mm (P: ${Math.round(perimeter)}mm) × H ${cylinderHeight}mm`
                  : `⌀ ${cylinderDiameter}mm (C: ${Math.round(perimeter)}mm) × H ${cylinderHeight}mm`}
              </span>
            </div>
          </div>

          {/* ============================================================
              1-PHOTO FULL 360° WRAP CARD
              ============================================================ */}
          {slotCount === 1 ? (
            <div className="w-full flex flex-col gap-4">
              {cylinderSlots.map((slot) => {
                const hasCrop = !!slot.cropData;

                return (
                  <div
                    key={slot.id}
                    className="p-4 sm:p-5 rounded-lg bg-[#10141d] border border-white/10 flex flex-col gap-4"
                  >
                    {/* Top status info */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-xs bg-amber-400/10 text-amber-400 font-mono text-xs font-bold border border-amber-400/20">
                          {isCube ? 'Full 4-Face Seamless Wrap' : 'Full 360° Seamless Wrap'}
                        </span>
                        <span className="text-xs text-slate-300 font-medium truncate max-w-xs">
                          {slot.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>Target aspect: ~{optimalWrapRatio}:1</span>
                        {hasCrop && (
                          <span className="px-1.5 py-0.5 rounded-xs bg-amber-400 text-slate-950 font-bold text-[10px]">
                            Custom Cropped
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Wide Panoramic Preview Banner */}
                    <div className="relative w-full aspect-[3/1] max-h-72 rounded-md overflow-hidden bg-black/80 border border-white/10 group">
                      <img
                        src={slot.imageSrc}
                        alt={slot.name}
                        className="w-full h-full object-cover"
                      />

                      {/* Angular guidelines overlay */}
                      <div className="absolute inset-x-0 bottom-0 py-1 px-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between text-[10px] font-mono text-slate-300">
                        {isCube ? (
                          <>
                            <span title="Left face (Side 4)">Left (270°)</span>
                            <span title="Back face seam (Side 3)">Back (180°)</span>
                            <span className="text-amber-400 font-bold" title="Front center facing camera (Side 1)">
                              Front (0°)
                            </span>
                            <span title="Right face (Side 2)">Right (90°)</span>
                            <span title="Left face wrap (Side 4)">Left (270°)</span>
                          </>
                        ) : (
                          <>
                            <span title="Back edge / wrap seam">180° (Back Seam)</span>
                            <span title="Left side">270° (Left)</span>
                            <span className="text-amber-400 font-bold" title="Front center facing camera">
                              0° (Front Center)
                            </span>
                            <span title="Right side">90° (Right)</span>
                            <span title="Back edge / wrap seam">180° (Back Seam)</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => slotInputRefs.current[slot.id]?.click()}
                          className="btn-secondary text-xs py-1.5 px-3 min-h-[32px]"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Replace Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCropSlot(slot.id)}
                          className="btn-secondary text-xs py-1.5 px-3 min-h-[32px]"
                        >
                          <CropIcon className="w-3.5 h-3.5" />
                          <span>Crop to Wrap ({optimalWrapRatio}:1)</span>
                        </button>
                        <input
                          ref={(el) => {
                            slotInputRefs.current[slot.id] = el;
                          }}
                          type="file"
                          accept="image/*,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onUploadCylinderSlotFile(slot.id, file);
                          }}
                        />
                      </div>

                      {onMatchCylinderHeightToPhoto && (
                        <button
                          type="button"
                          onClick={onMatchCylinderHeightToPhoto}
                          className="btn-secondary text-xs py-1.5 px-3 min-h-[32px] text-amber-400 border-amber-400/30 hover:border-amber-400"
                          title="Adjust height so this image wraps with zero cropping"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Match Height to Photo</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Sample Selector */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">
                        Try Sample:
                      </span>
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {SAMPLE_IMAGES.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            onClick={() =>
                              onUpdateCylinderSlot(slot.id, {
                                imageSrc: sample.url,
                                name: sample.name,
                                cropData: null,
                              })
                            }
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border text-xs font-mono transition-colors ${
                              slot.name === sample.name
                                ? 'border-amber-400 bg-amber-400/10 text-white'
                                : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                            }`}
                          >
                            <img
                              src={sample.url}
                              alt=""
                              className="w-4 h-4 rounded-xs object-cover"
                            />
                            <span>{sample.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ============================================================
               2, 3, or 4 PHOTOS GRID
               ============================================================ */
            <div
              className={`grid gap-4 ${
                slotCount === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : slotCount === 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              }`}
            >
              {cylinderSlots.map((slot, index) => {
                const labelInfo = labels[index] || {
                  label: `Side ${index + 1}`,
                  deg: `${index * 90}°`,
                  spanDeg: 90,
                };
                const hasCrop = !!slot.cropData;

                return (
                  <div
                    key={slot.id}
                    className="p-3.5 rounded-lg bg-[#10141d] border border-white/10 flex flex-col justify-between gap-3 hover:border-slate-600 transition-colors"
                  >
                    {/* Slot Title & Angle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-white truncate">
                          {labelInfo.label}
                        </span>
                        <span className="font-mono text-[10px] text-amber-400 font-bold shrink-0">
                          {labelInfo.deg}
                        </span>
                      </div>

                      {slotCount > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveCylinderSlot?.(slot.id)}
                          className="p-1 rounded-xs text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                          title={`Remove ${labelInfo.label}`}
                          aria-label={`Remove ${labelInfo.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Thumbnail Preview */}
                    <div
                      className={`relative w-full rounded-md overflow-hidden bg-black/60 border border-white/10 ${
                        isCube
                          ? slotCount === 2
                            ? 'aspect-[2/1]'
                            : slotCount === 3
                            ? 'aspect-[4/3]'
                            : 'aspect-[1/1]'
                          : slotCount === 2
                          ? 'aspect-[4/3]'
                          : slotCount === 3
                          ? 'aspect-[1/1]'
                          : 'aspect-[3/4]'
                      }`}
                    >
                      <img
                        src={slot.imageSrc}
                        alt={slot.name}
                        className="w-full h-full object-cover"
                      />

                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-xs bg-black/75 text-[10px] text-slate-300 font-mono border border-white/10 truncate max-w-[80%]">
                        {slot.name}
                      </div>

                      {hasCrop && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-xs bg-amber-400 text-slate-950 text-[10px] font-mono font-bold">
                          Cropped
                        </div>
                      )}
                    </div>

                    {/* Actions for this Slot */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => slotInputRefs.current[slot.id]?.click()}
                        className="btn-secondary text-xs py-1 px-2 min-h-[30px]"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Replace</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenCropSlot(slot.id)}
                        className="btn-secondary text-xs py-1 px-2 min-h-[30px]"
                      >
                        <CropIcon className="w-3 h-3" />
                        <span>Crop</span>
                      </button>
                      <input
                        ref={(el) => {
                          slotInputRefs.current[slot.id] = el;
                        }}
                        type="file"
                        accept="image/*,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUploadCylinderSlotFile(slot.id, file);
                        }}
                      />
                    </div>

                    {/* Quick Sample Selector */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">Sample:</span>
                      <div className="flex items-center gap-1.5">
                        {SAMPLE_IMAGES.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            onClick={() =>
                              onUpdateCylinderSlot(slot.id, {
                                imageSrc: sample.url,
                                name: sample.name,
                                cropData: null,
                              })
                            }
                            className={`w-5 h-5 rounded-xs overflow-hidden border shrink-0 transition-opacity ${
                              slot.name === sample.name
                                ? 'border-amber-400 opacity-100 ring-1 ring-amber-400'
                                : 'border-white/20 opacity-50 hover:opacity-100'
                            }`}
                            title={`Use ${sample.name}`}
                          >
                            <img
                              src={sample.url}
                              alt={sample.name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Interactive Reorderable Sequence Preview (for 2-4 photos) */}
          {slotCount > 1 && (
            <div className="p-3.5 sm:p-4 rounded-lg bg-[#10141d] border border-white/10">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="font-bold text-slate-200">Side Order</span>
                <span className="text-[11px] text-amber-400 font-medium">
                  Drag tiles or tap arrows to rearrange
                </span>
              </div>

              <div
                className="grid gap-1.5 sm:gap-2.5 w-full"
                style={{ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }}
              >
                {cylinderSlots.map((slot, idx) => {
                  const isDragging = draggedSlotIdx === idx;
                  const isOver = dragOverSlotIdx === idx;

                  return (
                    <div
                      key={slot.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedSlotIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(idx));
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverSlotIdx(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverSlotIdx === idx) setDragOverSlotIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedSlotIdx !== null && draggedSlotIdx !== idx) {
                          handleReorderSlots(draggedSlotIdx, idx);
                        }
                        setDraggedSlotIdx(null);
                        setDragOverSlotIdx(null);
                      }}
                      onDragEnd={() => {
                        setDraggedSlotIdx(null);
                        setDragOverSlotIdx(null);
                      }}
                      className={`group relative h-22 sm:h-26 rounded-md overflow-hidden border select-none transition-all cursor-grab active:cursor-grabbing ${
                        isOver
                          ? 'border-amber-400 ring-2 ring-amber-400 scale-[1.03] z-10'
                          : isDragging
                          ? 'opacity-40 border-dashed border-amber-400'
                          : 'border-white/15 hover:border-amber-400/80 bg-black/50'
                      }`}
                      title="Drag to reorder"
                    >
                      <img
                        src={slot.imageSrc}
                        alt={slot.name}
                        className="w-full h-full object-cover pointer-events-none"
                      />

                      {/* Drag Grip Icon */}
                      <div className="absolute top-1 right-1 p-0.5 rounded-xs bg-black/60 text-slate-300 opacity-70 group-hover:opacity-100 transition-opacity">
                        <GripVertical className="w-3 h-3" />
                      </div>

                      {/* Touch / Quick Nudge Reorder Buttons */}
                      <div className="absolute top-1 left-1 flex items-center gap-0.5">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReorderSlots(idx, idx - 1);
                            }}
                            className="p-1 rounded-xs bg-black/75 text-white/80 hover:text-amber-300 hover:bg-black transition-colors"
                            title="Move left"
                            aria-label="Move left"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                        {idx < cylinderSlots.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReorderSlots(idx, idx + 1);
                            }}
                            className="p-1 rounded-xs bg-black/75 text-white/80 hover:text-amber-300 hover:bg-black transition-colors"
                            title="Move right"
                            aria-label="Move right"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="absolute bottom-1 inset-x-1 px-1 py-0.5 rounded-xs bg-black/80 text-[10px] text-white font-mono flex items-center justify-between border border-white/10">
                        <span className="font-bold text-amber-300">#{idx + 1}</span>
                        <span className="truncate opacity-80">{labels[idx]?.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ================================================================
           FLAT / CURVED MODE: SINGLE PHOTO
           ================================================================ */
        <div className="w-full flex flex-col gap-6">
          <div className="p-4 sm:p-5 rounded-lg bg-[#10141d] border border-white/10">
            <div className="flex flex-col md:flex-row items-center gap-5">
              {/* Photo Preview Tile with Drop Target */}
              <div
                className={`relative w-44 sm:w-52 aspect-[3/4] rounded-md overflow-hidden bg-black/60 border select-none shrink-0 transition-colors ${
                  isDraggingOverSingle
                    ? 'border-amber-400 ring-2 ring-amber-400'
                    : 'border-white/15'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOverSingle(true);
                }}
                onDragLeave={() => setIsDraggingOverSingle(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingOverSingle(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) onUploadSingleFile(file);
                }}
              >
                <img
                  src={singleImageSrc}
                  alt={singleImageName}
                  className="w-full h-full object-cover"
                />

                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-xs bg-black/75 text-xs text-slate-300 font-mono border border-white/10 truncate max-w-[85%]">
                  {singleImageName}
                </div>

                {singleCropData && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-xs bg-amber-400 text-slate-950 text-xs font-mono font-bold shadow-xs">
                    Cropped
                  </div>
                )}
              </div>

              {/* Info & Action Controls */}
              <div className="flex-1 flex flex-col justify-between gap-4 w-full">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-xs bg-amber-400/10 text-amber-400 font-mono text-xs font-bold border border-amber-400/20">
                      {hasOwnPhoto ? 'Custom Upload' : 'Curated Preset'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {formatAspect(singleAspectRatio)} ({singleAspectRatio.toFixed(2)}:1)
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1.5 capitalize">
                    {singleImageName.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Higher-contrast photos with distinct lighting will produce the most dramatic and
                    detailed 3D lithophane results.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:max-w-xs">
                  <button
                    type="button"
                    onClick={() => singleInputRef.current?.click()}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{hasOwnPhoto ? 'Replace' : 'Upload Own'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenCropSingle}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    <CropIcon className="w-3.5 h-3.5" />
                    <span>Crop Photo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Curated Sample Library */}
          <div>
            <div className="text-xs font-bold text-slate-300 uppercase font-mono mb-2.5">
              Sample Photos
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SAMPLE_IMAGES.map((sample) => {
                const isSelected = singleImageName === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onSelectSample(sample)}
                    className={`text-left rounded-md overflow-hidden border p-1 transition-colors ${
                      isSelected
                        ? 'bg-[#181d28] border-amber-400 ring-1 ring-amber-400'
                        : 'bg-[#10141d] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full rounded-xs overflow-hidden bg-black mb-1.5">
                      <img
                        src={sample.url}
                        alt={sample.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="px-1 pb-1">
                      <div className="text-xs font-bold text-white truncate">{sample.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono font-medium">
                        {sample.category}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Strip: Compact, never overflows on mobile */}
      <div className="flex items-center justify-between gap-3 w-full max-w-5xl mt-6 p-3 sm:p-4 bg-[#10141d] border border-white/10 rounded-lg box-border">
        <button
          type="button"
          onClick={onBackToMode}
          className="btn-secondary text-xs py-2 px-3 sm:px-4 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onContinueToPreview}
          className="btn-primary text-xs py-2 px-4 sm:px-6 font-bold shrink-0"
        >
          <span className="font-bold">Preview 3D</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
