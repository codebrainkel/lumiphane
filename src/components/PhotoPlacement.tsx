import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CylinderSlot, ImageCropData, LithophaneShape } from '../types/lithophane';
import { ImageProcessor } from '../services/imageProcessor';
import {
  getMultiPanelSlotLabels,
  getSlotFrameAspect,
  resolveStripLayout,
} from '../constants/presets';

export function usePhotoFrame(
  src: string,
  frameAspect: number,
  cropData: ImageCropData | null | undefined,
  offsetX: number,
  offsetY: number
) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!src) {
      setNatural(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setNatural({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const aspect = Math.max(0.02, frameAspect || 1);
  const base = natural
    ? ImageProcessor.baseSourceRect(natural.width, natural.height, aspect, cropData)
    : null;
  const rect = natural
    ? ImageProcessor.resolveSourceRect(natural.width, natural.height, aspect, cropData, offsetX, offsetY)
    : null;

  const style: React.CSSProperties =
    rect && natural
      ? {
          backgroundColor: '#000',
          backgroundImage: `url("${src}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${(natural.width / rect.sw) * 100}% ${(natural.height / rect.sh) * 100}%`,
          backgroundPosition: `${
            natural.width <= rect.sw ? 50 : (rect.sx / (natural.width - rect.sw)) * 100
          }% ${natural.height <= rect.sh ? 50 : (rect.sy / (natural.height - rect.sh)) * 100}%`,
        }
      : { backgroundColor: '#000' };

  return { natural, base, rect, style };
}

export function FramedPhoto({
  src,
  alt,
  frameAspect,
  cropData,
  offsetX = 0,
  offsetY = 0,
  className,
  onOffsetChange,
}: {
  src: string;
  alt: string;
  frameAspect: number;
  cropData?: ImageCropData | null;
  offsetX?: number;
  offsetY?: number;
  className?: string;
  onOffsetChange?: (offset: { offsetX: number; offsetY: number }) => void;
}) {
  const frame = usePhotoFrame(src, frameAspect, cropData, offsetX, offsetY);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    sx: number;
    sy: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const canMoveX = !!frame.base && !!frame.natural && (frame.base.sx > 1 || frame.natural.width - (frame.base.sx + frame.base.sw) > 1);
  const canMoveY = !!frame.base && !!frame.natural && (frame.base.sy > 1 || frame.natural.height - (frame.base.sy + frame.base.sh) > 1);
  const canDrag = !!onOffsetChange && (canMoveX || canMoveY);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDrag || !frame.base || !frame.rect || !frame.natural || !onOffsetChange || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const base = frame.base;
    const natural = frame.natural;
    const apply = onOffsetChange;
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      sx: frame.rect.sx,
      sy: frame.rect.sy,
      width: bounds.width,
      height: bounds.height,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail for a synthetic pointer. Window listeners still follow the drag.
    }

    const applyMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== ev.pointerId || drag.width < 1 || drag.height < 1) return;
      const desiredSx = drag.sx - (ev.clientX - drag.clientX) * (base.sw / drag.width);
      const desiredSy = drag.sy - (ev.clientY - drag.clientY) * (base.sh / drag.height);
      apply(ImageProcessor.offsetsForWindow(base, natural.width, natural.height, desiredSx, desiredSy));
    };
    const end = (ev: PointerEvent) => {
      applyMove(ev);
      if (!dragRef.current || dragRef.current.pointerId !== ev.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener('pointermove', applyMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', applyMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    setDragging(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={canDrag ? `Drag ${alt} inside the frame` : alt}
      className={`${className ?? ''} ${canDrag ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
      style={{ ...frame.style, touchAction: canDrag ? 'none' : undefined }}
      onPointerDown={onPointerDown}
    />
  );
}

function useNarrowScreen() {
  const query = '(max-width: 1023px)';
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return narrow;
}

function fitBox(boxW: number, boxH: number, aspect: number) {
  const safeAspect = Math.max(0.05, aspect);
  let width = Math.max(0, boxW);
  let height = width / safeAspect;
  if (height > boxH) {
    height = Math.max(0, boxH);
    width = height * safeAspect;
  }
  return { width, height };
}

export function PhotoPlacementBoard({
  slots,
  shape,
  widthMm,
  heightMm,
  stripLayout,
  cylinderDiameter = 90,
  cubeWidth = 90,
  onOffsetChange,
  open,
  onOpenChange,
}: {
  slots: CylinderSlot[];
  shape: LithophaneShape;
  widthMm: number;
  heightMm: number;
  stripLayout?: string;
  cylinderDiameter?: number;
  cubeWidth?: number;
  onOffsetChange: (slotId: string, offset: { offsetX: number; offsetY: number }) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const setOpen = onOpenChange;
  const narrow = useNarrowScreen();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const count = Math.max(1, slots.length);
  const isStrip = shape === 'flat' || shape === 'curved';
  const layout = isStrip ? resolveStripLayout(stripLayout, count) : null;
  const labels = getMultiPanelSlotLabels(shape, count, stripLayout);
  const gridCols = layout?.gridCols ?? count;
  const gridRows = layout?.gridRows ?? 1;
  const sheetAspect =
    shape === 'cylinder'
      ? (Math.PI * Math.max(30, cylinderDiameter)) / Math.max(20, heightMm)
      : shape === 'cube'
      ? (4 * Math.max(30, cubeWidth)) / Math.max(20, heightMm)
      : Math.max(10, widthMm) / Math.max(10, heightMm);

  useEffect(() => {
    const stage = rootRef.current?.closest('.viewport-stage');
    if (!stage) return;
    stage.setAttribute('data-placing', open ? 'true' : 'false');
    return () => stage.setAttribute('data-placing', 'false');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = stageRef.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setBox({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, count, stripLayout, shape]);

  const fitted = fitBox(Math.max(0, box.width - 16), Math.max(0, box.height - 16), sheetAspect);
  const anyMoved = slots.some(
    (slot) => Math.abs(slot.offsetX ?? 0) > 0.001 || Math.abs(slot.offsetY ?? 0) > 0.001
  );

  const cells = layout
    ? layout.cells.map((cell, index) => ({
        index,
        col: cell.col,
        row: cell.row,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
      }))
    : slots.map((_, index) => ({
        index,
        col: index,
        row: 0,
        colSpan: 1,
        rowSpan: 1,
      }));

  const centerAll = () => {
    for (const slot of slots) {
      if ((slot.offsetX ?? 0) !== 0 || (slot.offsetY ?? 0) !== 0) {
        onOffsetChange(slot.id, { offsetX: 0, offsetY: 0 });
      }
    }
  };

  const board = (
    <aside id="photo-placement" className="placement-board" aria-label="Photo placement">
      <div className="placement-head">
        <button
          type="button"
          className="placement-close"
          aria-label="Close photo placement"
          onClick={() => setOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 font-mono">
            Place photos
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Drag a photo inside its frame.
          </p>
        </div>
        {anyMoved && (
          <button type="button" className="nav-action" onClick={centerAll}>
            Center
          </button>
        )}
        <button type="button" className="nav-action" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
      <div ref={stageRef} className="placement-stage">
        {fitted.width > 2 && fitted.height > 2 && (
          <div
            className="placement-sheet"
            style={{
              width: fitted.width,
              height: fitted.height,
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
            }}
          >
            {cells.map((cell) => {
              const slot = slots[cell.index];
              if (!slot) return null;
              const label = labels[cell.index];
              const frameAspect = getSlotFrameAspect(
                shape,
                widthMm,
                heightMm,
                count,
                stripLayout,
                cell.index,
                cylinderDiameter,
                cubeWidth
              );
              const moved =
                Math.abs(slot.offsetX ?? 0) > 0.001 || Math.abs(slot.offsetY ?? 0) > 0.001;
              return (
                <div
                  key={slot.id}
                  className="relative min-h-0 min-w-0 overflow-hidden bg-black"
                  style={{
                    gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                    gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                  }}
                >
                  {slot.imageSrc ? (
                    <FramedPhoto
                      src={slot.imageSrc}
                      alt={label?.label || `Photo ${cell.index + 1}`}
                      frameAspect={frameAspect}
                      cropData={slot.cropData}
                      offsetX={slot.offsetX ?? 0}
                      offsetY={slot.offsetY ?? 0}
                      className="absolute inset-0"
                      onOffsetChange={(offset) => onOffsetChange(slot.id, offset)}
                    />
                  ) : null}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                    <span className="block truncate text-xs font-bold text-white">
                      {label?.label || `Photo ${cell.index + 1}`}
                    </span>
                  </div>
                  {moved && count > 1 && (
                    <button
                      type="button"
                      className="coarse-target absolute top-1 right-1 z-10 min-h-8 rounded-xs bg-black/75 px-2 py-1 font-mono text-xs font-bold text-amber-300"
                      onClick={() => onOffsetChange(slot.id, { offsetX: 0, offsetY: 0 })}
                    >
                      Center
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div ref={rootRef} className="placement-layer">
      {open && (narrow ? createPortal(board, document.body) : board)}
    </div>
  );
}
