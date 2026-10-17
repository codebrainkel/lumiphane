import React, { useEffect, useRef, useState } from 'react';
import { CylinderSlot, PhotoUploadJob } from '../types/lithophane';
import { Upload, Plus, X } from 'lucide-react';

interface PhotoUploaderProps {
  cylinderSlots: CylinderSlot[];
  uploadJobs: PhotoUploadJob[];
  onUploadMultipleFiles: (files: File[]) => void;
  onRemoveCylinderSlot?: (slotId: string) => void;
}

const MAX_PHOTOS = 4;
const ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.bmp';

function isSlotReading(jobs: PhotoUploadJob[], slotId: string, index: number) {
  return jobs.some(
    (job) =>
      job.status === 'reading' &&
      (job.slotId ? job.slotId === slotId : job.slotIndex === index)
  );
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  cylinderSlots,
  uploadJobs,
  onUploadMultipleFiles,
  onRemoveCylinderSlot,
}) => {
  const dragDepth = useRef(0);
  const [isDraggingOverZone, setIsDraggingOverZone] = useState(false);
  const [useTap, setUseTap] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setUseTap(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const reading = uploadJobs.some((job) => job.status === 'reading');
  const cards = cylinderSlots
    .map((slot, index) => ({
      slot,
      index,
      loading: isSlotReading(uploadJobs, slot.id, index),
    }))
    .filter((item) => Boolean(item.slot.imageSrc) || item.loading);
  const atLimit = cards.length >= MAX_PHOTOS;

  const clearZoneDrag = () => {
    dragDepth.current = 0;
    setIsDraggingOverZone(false);
  };

  useEffect(() => {
    window.addEventListener('dragend', clearZoneDrag);
    window.addEventListener('drop', clearZoneDrag);
    return () => {
      window.removeEventListener('dragend', clearZoneDrag);
      window.removeEventListener('drop', clearZoneDrag);
    };
  }, []);

  const takeFiles = (files: File[]) => {
    if (files.length > 0) onUploadMultipleFiles(files);
  };

  const onDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDraggingOverZone(true);
  };

  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = atLimit ? 'none' : 'copy';
    setIsDraggingOverZone(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDraggingOverZone(false);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    clearZoneDrag();
    takeFiles(Array.from(event.dataTransfer.files || []));
  };

  const fileInput = (label: string) => (
    <input
      type="file"
      multiple
      accept={ACCEPT}
      className="sr-only"
      aria-label={label}
      onChange={(event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        takeFiles(files);
      }}
    />
  );

  return (
    <div
      className={`photo-step${isDraggingOverZone ? ' is-drag' : ''}${atLimit ? ' is-full' : ''}`}
      data-photo-drop=""
      aria-label={`Photos, ${cards.length} of ${MAX_PHOTOS}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {cards.length === 0 ? (
        <label className="photo-empty">
          {fileInput(useTap ? 'Choose photos' : 'Choose photos or drop them here')}
          <span className="photo-empty-icon" aria-hidden="true">
            {reading ? <span className="photo-spinner" /> : <Upload className="h-7 w-7" />}
          </span>
          <span className="photo-empty-title">
            {isDraggingOverZone ? 'Release to add' : useTap ? 'Tap to add photos' : 'Drop photos here'}
          </span>
          <span className="photo-empty-copy">
            {useTap ? 'Opens your photo library. ' : 'Or click to browse. '}
            JPEG, PNG, or WebP. Up to 4.
          </span>
        </label>
      ) : (
        <div className="photo-added">
          <h1>Add photos</h1>
          <p>
            {atLimit
              ? 'Four photos is the set. Take one off to add another.'
              : useTap
              ? 'Add up to 4. Take one off if you change your mind.'
              : 'Drop more anywhere here, up to 4.'}
          </p>
          <ul className="photo-row">
            {cards.map(({ slot, index, loading }) => (
              <li key={slot.id} className="photo-thumb">
                <div className="photo-frame">
                  {slot.imageSrc ? (
                    <img src={slot.imageSrc} alt="" draggable={false} />
                  ) : (
                    <span className="photo-spinner" role="status" aria-label="Loading photo" />
                  )}
                  {loading && slot.imageSrc && (
                    <span className="photo-thumb-loading" role="status" aria-label="Loading photo">
                      <span className="photo-spinner" />
                    </span>
                  )}
                </div>
                {slot.imageSrc && !loading && (
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => onRemoveCylinderSlot?.(slot.id)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
            {!atLimit && (
              <li>
                <label className={`photo-plus${isDraggingOverZone ? ' is-hot' : ''}`}>
                  {fileInput('Add photos')}
                  <Plus className="h-6 w-6" />
                  <span>Add</span>
                </label>
              </li>
            )}
          </ul>
          <p className="photo-count" role="status">
            {cards.length} of {MAX_PHOTOS}
          </p>
        </div>
      )}
    </div>
  );
};
