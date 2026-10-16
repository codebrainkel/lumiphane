import React, { useEffect, useRef, useState } from 'react';
import { CylinderSlot, PhotoUploadJob } from '../types/lithophane';
import {
  Upload,
  Crop as CropIcon,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';

interface PhotoUploaderProps {
  cylinderSlots: CylinderSlot[];
  uploadJobs: PhotoUploadJob[];
  onUploadCylinderSlotFile: (slotId: string, file: File) => void;
  onUploadMultipleFiles: (files: File[]) => void;
  onOpenCropSlot: (slotId: string) => void;
  onReorderCylinderSlots?: (newSlots: CylinderSlot[]) => void;
  onRemoveCylinderSlot?: (slotId: string) => void;
  onBackToMode: () => void;
  onContinueToPreview: () => void;
}

const MAX_PHOTOS = 4;

function SlotFileButton({
  slotId,
  label,
  className,
  children,
  onFile,
}: {
  slotId: string;
  label: string;
  className?: string;
  children: React.ReactNode;
  onFile: (slotId: string, file: File) => void;
}) {
  return (
    <label className={`relative ${className ?? ''}`} title={label}>
      <input
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp"
        className="sr-only"
        aria-label={label}
        data-slot-id={slotId}
        onChange={(event) => {
          const file = event.target.files?.[0];
          const id = event.currentTarget.dataset.slotId || slotId;
          event.target.value = '';
          if (file) onFile(id, file);
        }}
      />
      {children}
    </label>
  );
}

const overlayIconClass =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/60 text-white border border-white/20 shadow-md backdrop-blur-sm hover:bg-black/80 hover:text-amber-300 transition-colors';

function isSlotReading(jobs: PhotoUploadJob[], slotId: string, index: number) {
  return jobs.some(
    (job) =>
      job.status === 'reading' &&
      (job.slotId ? job.slotId === slotId : job.slotIndex === index)
  );
}

function CardLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/55"
      role="status"
      aria-live="polite"
      aria-label="Loading photo"
    >
      <span className="h-7 w-7 rounded-full border-2 border-white/25 border-t-amber-400 animate-spin" />
    </div>
  );
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  cylinderSlots,
  uploadJobs,
  onUploadCylinderSlotFile,
  onUploadMultipleFiles,
  onOpenCropSlot,
  onReorderCylinderSlots,
  onRemoveCylinderSlot,
  onBackToMode,
  onContinueToPreview,
}) => {
  const dragDepth = useRef(0);

  const [draggedSlotIdx, setDraggedSlotIdx] = useState<number | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);
  const [isDraggingOverZone, setIsDraggingOverZone] = useState(false);
  const [useTap, setUseTap] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setUseTap(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const filledCount = cylinderSlots.filter((slot) => Boolean(slot.imageSrc)).length;
  const reading = uploadJobs.some((job) => job.status === 'reading');
  const cards = cylinderSlots
    .map((slot, index) => ({
      slot,
      index,
      loading: isSlotReading(uploadJobs, slot.id, index),
    }))
    .filter((item) => Boolean(item.slot.imageSrc) || item.loading);
  const atLimit = cards.length >= MAX_PHOTOS;
  const photosReady = filledCount > 0 && filledCount === cylinderSlots.length && !reading;

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
    onReorderCylinderSlots?.(newSlots);
  };

  const zoneTitle = isDraggingOverZone
    ? 'Release to add'
    : filledCount === 0
    ? useTap
      ? 'Tap to add photos'
      : 'Drop photos here'
    : useTap
    ? 'Tap to add more'
    : 'Drop to add more';

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-6 md:py-10 flex flex-col items-center justify-start box-border">
      <div className="text-center max-w-2xl mb-6">
        <div className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono mb-2">
          Step 2 · Add Photos
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Add photos</h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          Add up to 4 photos. The same set is used for every shape.
        </p>
      </div>

      {!atLimit && (
        <label
          data-photo-drop=""
          className={`relative w-full mb-4 rounded-lg border border-dashed flex flex-col items-center justify-center text-center cursor-pointer select-none transition-colors ${
            cards.length === 0 ? 'min-h-[220px] sm:min-h-[280px] px-5 py-8' : 'min-h-[120px] px-5 py-6'
          } ${
            isDraggingOverZone
              ? 'border-amber-400 bg-amber-400/10 ring-2 ring-amber-400/40'
              : 'border-white/20 bg-[#10141d] hover:border-amber-400/70 hover:bg-[#141924]'
          } focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400`}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            dragDepth.current += 1;
            setIsDraggingOverZone(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setIsDraggingOverZone(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setIsDraggingOverZone(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setIsDraggingOverZone(false);
            const files = Array.from(event.dataTransfer.files || []);
            if (files.length > 0) onUploadMultipleFiles(files);
          }}
        >
          <input
            type="file"
            multiple
            accept="image/*,.png,.jpg,.jpeg,.webp,.bmp"
            className="sr-only"
            aria-label={useTap ? 'Choose photos' : 'Choose photos or drop them here'}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              if (files.length > 0) onUploadMultipleFiles(files);
            }}
          />
          <div
            className={`w-12 h-12 rounded-md flex items-center justify-center border mb-3 ${
              isDraggingOverZone
                ? 'bg-amber-400 text-slate-950 border-amber-400'
                : 'bg-amber-400/10 text-amber-400 border-amber-400/30'
            }`}
          >
            {reading && cards.length === 0 ? (
              <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>
          <div className="text-xs font-bold tracking-wider text-amber-400 uppercase font-mono">
            {useTap ? 'Tap to upload' : 'Drop to upload'}
          </div>
          <div className="text-lg sm:text-xl font-bold text-white mt-1">{zoneTitle}</div>
          <p className="text-sm text-slate-400 mt-1.5 max-w-md leading-relaxed">
            {useTap ? 'Opens your photo library. ' : 'Or click to browse. '}
            JPEG, PNG, or WebP. Up to 4 photos.
          </p>
        </label>
      )}

      {cards.length > 0 && (
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map(({ slot, index, loading }) => {
            const hasPhoto = Boolean(slot.imageSrc);
            const isDragging = draggedSlotIdx === index;
            const isOver = dragOverSlotIdx === index;

            return (
              <div
                key={slot.id}
                draggable={hasPhoto}
                onDragStart={(event) => {
                  if (event.dataTransfer.types.includes('Files')) return;
                  if ((event.target as HTMLElement).closest('button, input, a, label')) {
                    event.preventDefault();
                    return;
                  }
                  setDraggedSlotIdx(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.types.includes('Files')) {
                    event.dataTransfer.dropEffect = 'copy';
                  }
                  setDragOverSlotIdx(index);
                }}
                onDragLeave={() => {
                  if (dragOverSlotIdx === index) setDragOverSlotIdx(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const file = event.dataTransfer.files?.[0];
                  const slotId = event.currentTarget.dataset.slotId || slot.id;
                  if (file) {
                    onUploadCylinderSlotFile(slotId, file);
                    setDraggedSlotIdx(null);
                    setDragOverSlotIdx(null);
                    return;
                  }
                  if (draggedSlotIdx !== null && draggedSlotIdx !== index) {
                    handleReorderSlots(draggedSlotIdx, index);
                  }
                  setDraggedSlotIdx(null);
                  setDragOverSlotIdx(null);
                }}
                onDragEnd={() => {
                  setDraggedSlotIdx(null);
                  setDragOverSlotIdx(null);
                }}
                data-photo-drop=""
                data-slot-id={slot.id}
                className={`relative aspect-square overflow-hidden rounded-lg bg-black ${
                  hasPhoto ? 'cursor-grab active:cursor-grabbing' : ''
                } ${
                  isOver
                    ? 'ring-2 ring-amber-400 z-10'
                    : isDragging
                    ? 'opacity-40'
                    : ''
                }`}
              >
                {hasPhoto ? (
                  <img
                    src={slot.imageSrc}
                    alt={`Photo ${index + 1}`}
                    draggable={false}
                    className="absolute inset-0 h-full w-full max-w-none object-cover"
                  />
                ) : null}

                {hasPhoto && !loading && (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
                    {cards.length > 1 && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                    )}
                    {slot.cropData && (
                      <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-xs bg-amber-400 text-slate-950 text-[10px] font-mono font-bold">
                        Cropped
                      </div>
                    )}
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                      <SlotFileButton
                        slotId={slot.id}
                        label={`Replace photo ${index + 1}`}
                        className={overlayIconClass}
                        onFile={onUploadCylinderSlotFile}
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </SlotFileButton>
                      <button
                        type="button"
                        onClick={() => onOpenCropSlot(slot.id)}
                        className={overlayIconClass}
                        aria-label={`Crop photo ${index + 1}`}
                        title="Crop"
                      >
                        <CropIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveCylinderSlot?.(slot.id)}
                        className={overlayIconClass}
                        aria-label={`Remove photo ${index + 1}`}
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {cards.length > 1 && (
                      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleReorderSlots(index, index - 1)}
                            className={overlayIconClass}
                            title="Move earlier"
                            aria-label={`Move photo ${index + 1} earlier`}
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {index < cylinderSlots.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleReorderSlots(index, index + 1)}
                            className={overlayIconClass}
                            title="Move later"
                            aria-label={`Move photo ${index + 1} later`}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
                {loading && <CardLoadingOverlay />}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 w-full max-w-5xl mt-6">
        <button type="button" onClick={onBackToMode} className="btn-secondary shrink-0">
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          <span>Back</span>
        </button>

        <button
          type="button"
          onClick={onContinueToPreview}
          disabled={!photosReady}
          className="btn-primary shrink-0"
        >
          <span className="font-bold">Preview 3D</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
