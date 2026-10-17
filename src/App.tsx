import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LithophaneSettings,
  MeshGeometryData,
  MeshValidationResult,
  ImageCropData,
  CylinderSlot,
  AppStep,
  LithophaneShape,
  PhotoUploadJob,
} from './types/lithophane';
import {
  DEFAULT_SETTINGS,
  getAutoScaledThickness,
  getResolutionForTier,
  getCylinderResolutionForTier,
  getCubeResolutionForTier,
  getMultiPanelSlotLabels,
  getOptimalMultiPanelWrapRatio,
  getStripCellAspect,
  getStripCellWidthMm,
  getStripHeightForPhotos,
  resolveStripLayout,
} from './constants/presets';
import { ImageProcessor, ProcessedImageResult } from './services/imageProcessor';
import { GeometryGenerator } from './services/geometryGenerator';
import { MeshValidator } from './services/meshValidator';
import { Header } from './components/Header';
import { ModeSelector } from './components/ModeSelector';
import { PhotoUploader } from './components/PhotoUploader';
import { Viewport3D } from './components/Viewport3D';
import { PhotoPlacementBoard } from './components/PhotoPlacement';
import { ControlPanel } from './components/ControlPanel';
import { ValidationModal } from './components/ValidationModal';
import { CropModal } from './components/CropModal';
import { SlicingModal } from './components/SlicingModal';
import { OrderPrintModal } from './components/OrderPrintModal';
import { AlertCircle, ArrowLeft, ArrowRight, Download } from 'lucide-react';

async function readImageAsDataUrl(
  file: File,
  onProgress: (progress: number) => void
): Promise<string> {
  const total = Math.max(file.size, 1);

  if (typeof file.stream === 'function') {
    const streamReader = file.stream().getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await streamReader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(Math.min(99, Math.round((loaded / total) * 100)));
    }

    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const blob = new Blob([merged], { type: file.type || 'application/octet-stream' });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Could not read image'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
      reader.readAsDataURL(blob);
    });
    onProgress(100);
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    reader.onload = () => {
      onProgress(100);
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function mergeAutoThickness(
  prev: LithophaneSettings,
  auto: ReturnType<typeof getAutoScaledThickness>,
  patch: Partial<LithophaneSettings>
): LithophaneSettings {
  return {
    ...prev,
    ...patch,
    ...auto,
    frameWidth: prev.frameWidth,
  };
}

export default function App() {
  // Stepper Flow: 'mode' -> 'upload' -> 'preview'
  const [currentStep, setCurrentStep] = useState<AppStep>('mode');
  const [placementOpen, setPlacementOpen] = useState(false);

  // Core Lithophane Settings
  const [settings, setSettings] = useState<LithophaneSettings>(DEFAULT_SETTINGS);
  const [shapeChosen, setShapeChosen] = useState(false);

  // Single Photo State (for Flat / Curved modes). Mirrors the first slot.
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageName, setImageName] = useState<string>('');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [cropData, setCropData] = useState<ImageCropData | null>(null);

  // Shared photo slots. Every shape uses the same 1 to 4 photos and tiles them to fit.
  const [cylinderSlots, setCylinderSlots] = useState<CylinderSlot[]>([]);
  const [uploadJobs, setUploadJobs] = useState<PhotoUploadJob[]>([]);
  const uploadSeqRef = useRef(0);
  const slotSeqRef = useRef(0);
  const targetUploadSlotIdRef = useRef<string | null>(null);
  const [loadedCylinderImages, setLoadedCylinderImages] = useState<Record<string, HTMLImageElement>>({});

  // Active Crop Target (null for single photo, or slotId string for cylinder slot)
  const [cropTargetSlotId, setCropTargetSlotId] = useState<string | null>(null);


  // Generated Mesh & Diagnostics
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [geometryData, setGeometryData] = useState<MeshGeometryData | null>(null);
  const [validationResult, setValidationResult] = useState<MeshValidationResult | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [showSlicingModal, setShowSlicingModal] = useState<boolean>(false);
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [printOrderingEnabled, setPrintOrderingEnabled] = useState<boolean>(false);
  const [emailExportEnabled, setEmailExportEnabled] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/print-order/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { enabled?: boolean } | null) => {
        if (!cancelled) setPrintOrderingEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setPrintOrderingEnabled(false);
      });
    fetch('/api/email-export/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { enabled?: boolean } | null) => {
        if (!cancelled) setEmailExportEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setEmailExportEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // =========================================================================
  // 1. Load Images
  // =========================================================================

  // A. Single image load (flat / curved)
  useEffect(() => {
    if (!imageSrc) {
      setLoadedImage(null);
      return;
    }
    let isCancelled = false;
    ImageProcessor.loadImage(imageSrc)
      .then((img) => {
        if (!isCancelled) {
          setLoadedImage(img);
          setErrorMessage(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Image load failed:', err);
          setErrorMessage('Could not load image. Please try a different PNG or JPEG file.');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [imageSrc]);

  // Keep the legacy single-image fields aligned with the first slot.
  useEffect(() => {
    const first = cylinderSlots[0];
    const nextSrc = first?.imageSrc ?? '';
    const nextName = first?.name ?? '';
    setImageSrc((current) => (current === nextSrc ? current : nextSrc));
    setImageName((current) => (current === nextName ? current : nextName));
    setCropData(first?.cropData ?? null);
  }, [cylinderSlots]);

  // B. Load every photo slot (all shapes use 1 to 4 images)
  useEffect(() => {
    const readySlots = cylinderSlots.filter((slot) => slot.imageSrc);
    if (readySlots.length === 0) {
      setLoadedCylinderImages({});
      return;
    }

    let isCancelled = false;
    const promises = readySlots.map((slot) =>
      ImageProcessor.loadImage(slot.imageSrc).then((img) => ({ id: slot.id, img }))
    );

    Promise.all(promises)
      .then((results) => {
        if (!isCancelled) {
          const map: Record<string, HTMLImageElement> = {};
          results.forEach((item) => {
            map[item.id] = item.img;
          });
          setLoadedCylinderImages(map);
          setErrorMessage(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Cylinder slot image load failed:', err);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [cylinderSlots]);

  // Flat and curved panels change height so each tiled photo keeps its proportions.
  useEffect(() => {
    if (settings.shape === 'cylinder' || settings.shape === 'cube') return;
    const slot = cylinderSlots[0];
    if (!slot) return;
    const img = loadedCylinderImages[slot.id];
    if (!img) return;

    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const aspect = slot.cropData ? slot.cropData.width / slot.cropData.height : nw / nh;
    const autoHeight = getStripHeightForPhotos(
      settings.width,
      aspect,
      cylinderSlots.length,
      settings.stripLayout
    );
    const autoThickness = getAutoScaledThickness(settings.width, autoHeight);

    setSettings((prev) => {
      if (prev.shape === 'cylinder' || prev.shape === 'cube') return prev;
      if (prev.height === autoHeight && prev.minThickness === autoThickness.minThickness) return prev;
      return mergeAutoThickness(prev, autoThickness, { height: autoHeight });
    });
  }, [cylinderSlots, loadedCylinderImages, settings.shape, settings.width, settings.stripLayout]);

  // Slot names follow the shape: faces on a lamp, positions on a panel.
  useEffect(() => {
    setCylinderSlots((prev) => {
      const labels = getMultiPanelSlotLabels(settings.shape, prev.length, settings.stripLayout);
      const next = prev.map((slot, index) => ({
        ...slot,
        label: labels[index] ? `${labels[index].label}${labels[index].deg ? ` (${labels[index].deg})` : ''}` : slot.label,
      }));
      if (next.every((slot, index) => slot.label === prev[index].label)) return prev;
      return next;
    });
  }, [settings.shape, settings.stripLayout, cylinderSlots.length]);

  // =========================================================================
  // 2. Debounced Pipeline Trigger
  // =========================================================================
  const runPipeline = useCallback(() => {
    setIsGenerating(true);
    setErrorMessage(null);

    setTimeout(() => {
      try {
        let processed: ProcessedImageResult;

        if (settings.shape === 'cube') {
          // Process 1 to 4 images for 4-sided hollow cube
          const slotItems = cylinderSlots.map((slot) => ({
            img: loadedCylinderImages[slot.id] || loadedImage || new Image(),
            cropData: slot.cropData,
            offsetX: slot.offsetX ?? 0,
            offsetY: slot.offsetY ?? 0,
            label: slot.label,
            name: slot.name,
          }));

          const cubeSettings: LithophaneSettings = {
            ...settings,
            cubePanelCount: cylinderSlots.length,
          };

          const cols = getCubeResolutionForTier(
            settings.qualityTier || 'master',
            settings.cubeWidth || 90
          );
          processed = ImageProcessor.processCubeImages(slotItems, cubeSettings, cols);
          setProcessedImage(processed);

          // Step B: Generate Watertight Solid Geometry
          const geometry = GeometryGenerator.generateMesh(
            processed.luminanceGrid,
            processed.cols,
            processed.rows,
            cubeSettings
          );
          setGeometryData(geometry);

          // Step C: Validate Mesh Topology and Compute Metrics
          const validation = MeshValidator.validate(geometry);
          setValidationResult(validation);
        } else if (settings.shape === 'cylinder') {
          // Process 1 to 4 images for 360° cylinder
          const slotItems = cylinderSlots.map((slot) => ({
            img: loadedCylinderImages[slot.id] || loadedImage || new Image(),
            cropData: slot.cropData,
            offsetX: slot.offsetX ?? 0,
            offsetY: slot.offsetY ?? 0,
            label: slot.label,
            name: slot.name,
          }));

          const cylSettings: LithophaneSettings = {
            ...settings,
            cylinderPanelCount: cylinderSlots.length,
          };

          // Target columns around cylinder scaled to physical circumference and quality tier
          const cols = getCylinderResolutionForTier(
            settings.qualityTier || 'master',
            settings.cylinderDiameter || 90
          );
          processed = ImageProcessor.processCylinderImages(slotItems, cylSettings, cols);
          setProcessedImage(processed);

          // Step B: Generate Watertight Solid Geometry
          const geometry = GeometryGenerator.generateMesh(
            processed.luminanceGrid,
            processed.cols,
            processed.rows,
            cylSettings
          );
          setGeometryData(geometry);

          // Step C: Validate Mesh Topology and Compute Metrics
          const validation = MeshValidator.validate(geometry);
          setValidationResult(validation);
        } else {
          // Flat or curved: 1 photo fills the panel, 2–4 photos tile across it
          const slotItems = cylinderSlots.map((slot) => ({
            img: loadedCylinderImages[slot.id] || loadedImage || new Image(),
            cropData: slot.cropData,
            offsetX: slot.offsetX ?? 0,
            offsetY: slot.offsetY ?? 0,
            label: slot.label,
            name: slot.name,
          }));
          const primary = slotItems[0];
          if (!primary?.img || !(primary.img.naturalWidth || primary.img.width)) {
            setIsGenerating(false);
            return;
          }
          const cols = getResolutionForTier(settings.qualityTier || 'master', settings.width);
          processed =
            cylinderSlots.length <= 1
              ? ImageProcessor.processImage(
                  primary.img,
                  settings,
                  cols,
                  primary.cropData,
                  primary.offsetX,
                  primary.offsetY
                )
              : ImageProcessor.processStripImages(slotItems, settings, cols);
          setProcessedImage(processed);

          // Step B: Generate Watertight Solid Geometry
          const geometry = GeometryGenerator.generateMesh(
            processed.luminanceGrid,
            processed.cols,
            processed.rows,
            settings
          );
          setGeometryData(geometry);

          // Step C: Validate Mesh Topology and Compute Metrics
          const validation = MeshValidator.validate(geometry);
          setValidationResult(validation);
        }
      } catch (err: unknown) {
        console.error('Geometry pipeline error:', err);
        setErrorMessage(
          'Geometry generation error: ' + (err instanceof Error ? err.message : String(err))
        );
      } finally {
        setIsGenerating(false);
      }
    }, 40);
  }, [loadedImage, loadedCylinderImages, settings, cropData, cylinderSlots]);

  // Trigger pipeline with 80ms debounce
  useEffect(() => {
    if (cylinderSlots.length === 0) return;
    const missingPhoto = cylinderSlots.some((slot) => !slot.imageSrc);
    if (missingPhoto) {
      setGeometryData(null);
      setProcessedImage(null);
      setValidationResult(null);
      setIsGenerating(false);
      return;
    }
    const allLoaded = cylinderSlots.every((s) => !!loadedCylinderImages[s.id]);
    if (!allLoaded) return;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      runPipeline();
    }, 80);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadedImage, loadedCylinderImages, settings, cropData, cylinderSlots, runPipeline]);

  // =========================================================================
  // 3. User Actions & Handlers
  // =========================================================================

  const photosReady =
    cylinderSlots.length > 0 && cylinderSlots.every((slot) => Boolean(slot.imageSrc));

  const readFilesIntoIndexes = (files: File[], indexes: number[], slotIds?: string[]) => {
    const jobs: PhotoUploadJob[] = files.map((file, fileIndex) => ({
      id: `upload_${++uploadSeqRef.current}`,
      fileName: file.name,
      progress: 0,
      status: 'reading',
      slotId: slotIds?.[fileIndex],
      slotIndex: slotIds?.[fileIndex] ? undefined : indexes[fileIndex],
    }));
    setUploadJobs((prev) => [...prev, ...jobs]);

    files.forEach((file, fileIndex) => {
      const job = jobs[fileIndex];
      const slotIndex = indexes[fileIndex];
      const slotId = slotIds?.[fileIndex];
      let lastReported = -1;

      readImageAsDataUrl(file, (progress) => {
        if (progress !== 100 && progress < lastReported + 2) return;
        lastReported = progress;
        setUploadJobs((prev) =>
          prev.map((item) => (item.id === job.id ? { ...item, progress } : item))
        );
      })
        .then((dataUrl) => {
          const name = file.name.replace(/\.[^/.]+$/, '');
          setCylinderSlots((prev) =>
            prev.map((slot, index) => {
              const matches = slotId ? slot.id === slotId : index === slotIndex;
              return matches
                ? { ...slot, imageSrc: dataUrl, name, cropData: null, offsetX: 0, offsetY: 0 }
                : slot;
            })
          );
          setUploadJobs((prev) =>
            prev.map((item) =>
              item.id === job.id ? { ...item, progress: 100, status: 'done' } : item
            )
          );
          window.setTimeout(() => {
            setUploadJobs((prev) => prev.filter((item) => item.id !== job.id));
          }, 900);
        })
        .catch((err: unknown) => {
          console.error('Image read failed:', err);
          setErrorMessage(`Could not read ${file.name}.`);
          setUploadJobs((prev) =>
            prev.map((item) => (item.id === job.id ? { ...item, status: 'error' } : item))
          );
          window.setTimeout(() => {
            setUploadJobs((prev) => prev.filter((item) => item.id !== job.id));
          }, 3200);
        });
    });
  };

  const placeUploadedFiles = (incoming: File[]) => {
    const images = incoming.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const filled = cylinderSlots.filter((slot) => slot.imageSrc);
    const room = 4 - filled.length;
    if (room <= 0) {
      setErrorMessage('Four photos is the limit. Remove one to add another.');
      return;
    }

    const take = Math.min(images.length, room);
    const notes: string[] = [];
    if (images.length < incoming.length) {
      notes.push('Skipped files that are not images. Use JPEG, PNG, or WebP.');
    }
    if (images.length > take) {
      notes.push('Only 4 photos fit, so the extra ones were left out.');
    }
    if (notes.length > 0) setErrorMessage(notes.join(' '));

    const count = filled.length + take;
    const labels = getMultiPanelSlotLabels(settings.shape, count, settings.stripLayout);
    const labelFor = (index: number) =>
      labels[index].deg ? `${labels[index].label} (${labels[index].deg})` : labels[index].label;
    const nextSlots: CylinderSlot[] = filled.map((slot, index) => ({
      ...slot,
      label: labelFor(index),
    }));
    const newIds: string[] = [];
    for (let index = filled.length; index < count; index += 1) {
      slotSeqRef.current += 1;
      const id = `slot_${slotSeqRef.current}`;
      newIds.push(id);
      nextSlots.push({
        id,
        label: labelFor(index),
        name: '',
        imageSrc: '',
        cropData: null,
        offsetX: 0,
        offsetY: 0,
      });
    }

    setSettings((prev) => ({
      ...prev,
      cylinderPanelCount: count,
      cubePanelCount: count,
    }));
    setCylinderSlots(nextSlots);
    readFilesIntoIndexes(images.slice(0, take), [], newIds);
  };

  const handleUploadCylinderSlotFile = (slotId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }
    if (!cylinderSlots.some((slot) => slot.id === slotId)) return;
    readFilesIntoIndexes([file], [-1], [slotId]);
  };

  const handleRemoveCylinderSlot = (slotId: string) => {
    const remaining = cylinderSlots.filter((slot) => slot.id !== slotId);
    const newCount = remaining.length;
    setSettings((prev) => ({
      ...prev,
      cylinderPanelCount: Math.max(1, newCount),
      cubePanelCount: Math.max(1, newCount),
    }));
    if (newCount === 0) {
      setCylinderSlots([]);
      return;
    }
    const labels = getMultiPanelSlotLabels(settings.shape, newCount, settings.stripLayout);
    setCylinderSlots(
      remaining.map((slot, index) => ({
        ...slot,
        label: labels[index].deg ? `${labels[index].label} (${labels[index].deg})` : labels[index].label,
      }))
    );
  };

  const handleMatchCylinderHeightToPhoto = () => {
    const slot = cylinderSlots[0];
    if (!slot) return;
    const img = loadedCylinderImages[slot.id];
    if (!img) return;

    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const aspect = slot.cropData ? slot.cropData.width / slot.cropData.height : nw / nh;

    const count = cylinderSlots.length;
    const isCube = settings.shape === 'cube';
    const totalPerimeter = isCube
      ? 4 * (settings.cubeWidth || 90)
      : Math.PI * (settings.cylinderDiameter || 90);
    const panelWidth = totalPerimeter / count;
    // panelWidth / newHeight = aspect => newHeight = panelWidth / aspect
    const autoHeight = Math.max(30, Math.min(220, Math.round(panelWidth / aspect)));
    const autoThickness = getAutoScaledThickness(panelWidth, autoHeight);
    setSettings((prev) => mergeAutoThickness(prev, autoThickness, { height: autoHeight }));
  };

  const handleApplyCrop = (newCrop: ImageCropData | null) => {
    if (cropTargetSlotId) {
      setCylinderSlots((prev) =>
        prev.map((s) =>
          s.id === cropTargetSlotId ? { ...s, cropData: newCrop, offsetX: 0, offsetY: 0 } : s
        )
      );
      if (cropTargetSlotId === cylinderSlots[0]?.id) {
        setCropData(newCrop);
      }
    } else {
      setCropData(newCrop);
      setCylinderSlots((prev) =>
        prev.map((slot, index) =>
          index === 0 ? { ...slot, cropData: newCrop, offsetX: 0, offsetY: 0 } : slot
        )
      );
    }
  };

  const handleUpdateSlotOffset = (
    slotId: string,
    offset: { offsetX: number; offsetY: number }
  ) => {
    const offsetX = Math.round(Math.max(-1, Math.min(1, offset.offsetX)) * 100) / 100;
    const offsetY = Math.round(Math.max(-1, Math.min(1, offset.offsetY)) * 100) / 100;
    setCylinderSlots((prev) => {
      const current = prev.find((slot) => slot.id === slotId);
      if (!current) return prev;
      if ((current.offsetX ?? 0) === offsetX && (current.offsetY ?? 0) === offsetY) return prev;
      return prev.map((slot) => (slot.id === slotId ? { ...slot, offsetX, offsetY } : slot));
    });
  };

  const handleUpdateWidth = (newWidth: number) => {
    const clampedW = Math.max(40, Math.min(260, Math.round(newWidth)));
    const slot = cylinderSlots[0];
    const img = slot ? loadedCylinderImages[slot.id] : loadedImage;
    const photoAspect = slot?.cropData
      ? slot.cropData.width / slot.cropData.height
      : img
      ? (img.naturalWidth || img.width) / (img.naturalHeight || img.height)
      : cropData
      ? cropData.width / cropData.height
      : processedImage?.aspectRatio || 1.33;
    const newH = getStripHeightForPhotos(
      clampedW,
      photoAspect,
      cylinderSlots.length,
      settings.stripLayout
    );
    const autoThickness = getAutoScaledThickness(clampedW, newH);
    setSettings((prev) => mergeAutoThickness(prev, autoThickness, { width: clampedW, height: newH }));
  };

  const handleUpdateSettings = (newSettings: Partial<LithophaneSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleSelectShape = (shape: LithophaneShape) => {
    setShapeChosen(true);
    setSettings((prev) => ({
      ...prev,
      shape,
      ...(shape === 'cylinder'
        ? { cylinderDiameter: prev.cylinderDiameter || 90, height: 95 }
        : shape === 'cube'
        ? { cubeWidth: prev.cubeWidth || 90, height: 90 }
        : {}),
    }));
  };

  const handleResetSettings = () => {
    const aspect = loadedImage
      ? (loadedImage.naturalWidth || loadedImage.width) / (loadedImage.naturalHeight || loadedImage.height)
      : DEFAULT_SETTINGS.width / DEFAULT_SETTINGS.height;
    const defaultH = Math.max(10, Math.round(DEFAULT_SETTINGS.width / aspect));
    const autoThickness = getAutoScaledThickness(DEFAULT_SETTINGS.width, defaultH);
    setSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      shape: prev.shape,
      height: prev.shape === 'cylinder' ? 95 : prev.shape === 'cube' ? 90 : defaultH,
      ...autoThickness,
    }));
    setCropData(null);
  };

  // preventDefault is required for drops to land. Reorder drags are ignored in handleDrop.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    const dropTarget = e.target instanceof Element ? e.target : (e.target as Node).parentElement;
    if (dropTarget?.closest('[data-photo-drop]')) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) placeUploadedFiles(files);
  };

  const handleStepChange = (step: AppStep) => {
    if (step === 'preview' && !photosReady) {
      setCurrentStep('upload');
      setErrorMessage('Add at least one photo before opening the 3D preview.');
      return;
    }
    setCurrentStep(step);
  };

  // Active crop image data
  const activeCropImageSrc = cropTargetSlotId
    ? cylinderSlots.find((s) => s.id === cropTargetSlotId)?.imageSrc || imageSrc
    : imageSrc;
  const activeCropInitial = cropTargetSlotId
    ? cylinderSlots.find((s) => s.id === cropTargetSlotId)?.cropData || null
    : cropData;

  const photoCount = Math.max(1, cylinderSlots.length);
  const isCubeShape = settings.shape === 'cube';
  const isCylinderShape = settings.shape === 'cylinder';
  const isStripShape = !isCubeShape && !isCylinderShape;
  const cropSlotIndex = Math.max(
    0,
    cropTargetSlotId ? cylinderSlots.findIndex((slot) => slot.id === cropTargetSlotId) : 0
  );
  const stripLayout = resolveStripLayout(settings.stripLayout, photoCount);
  const cropCellLabel = stripLayout.cells[Math.min(cropSlotIndex, stripLayout.cells.length - 1)]?.label;
  const cropSpanMm = isCubeShape
    ? (4 * (settings.cubeWidth || 90)) / photoCount
    : isCylinderShape
    ? (Math.PI * (settings.cylinderDiameter || 90)) / photoCount
    : isStripShape
    ? getStripCellWidthMm(settings.width, photoCount, settings.stripLayout, cropSlotIndex)
    : settings.width / photoCount;
  const cropSizeMm = isCubeShape
    ? settings.cubeWidth || 90
    : isCylinderShape
    ? settings.cylinderDiameter || 90
    : settings.width;
  const cropTileAspect = isStripShape
    ? getStripCellAspect(
        settings.width,
        settings.height,
        photoCount,
        settings.stripLayout,
        cropSlotIndex
      )
    : getOptimalMultiPanelWrapRatio(settings.shape, cropSizeMm, settings.height, photoCount);
  const lockCropToTile = !isStripShape || photoCount > 1;
  const exportName =
    photoCount > 1 ? `${settings.shape}_lithophane_${photoCount}photos` : imageName || 'lithophane';
  const orderReady = Boolean(geometryData) && !isGenerating;

  return (
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) placeUploadedFiles([file]);
        }}
      />
      <input
        ref={slotFileInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const slotId = targetUploadSlotIdRef.current;
          e.target.value = '';
          if (file && slotId) {
            handleUploadCylinderSlotFile(slotId, file);
          }
        }}
      />

      {/* Top Bar Header with 3-Step Navigation Stepper */}
      <Header
        currentStep={currentStep}
        onStepChange={handleStepChange}
        shape={shapeChosen ? settings.shape : null}
      />

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-950/40 border-b border-red-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs text-red-200 z-20">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-medium text-red-300 hover:text-red-100 sm:min-h-0 sm:px-2 sm:text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          STEP 1: CHOOSE MODE
          ===================================================================== */}
      {currentStep === 'mode' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ModeSelector
            selectedShape={shapeChosen ? settings.shape : null}
            onSelectShape={handleSelectShape}
          />
        </div>
      )}

      {/* =====================================================================
          STEP 2: ADD UP TO 4 PHOTOS
          ===================================================================== */}
      {currentStep === 'upload' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <PhotoUploader
            cylinderSlots={cylinderSlots}
            uploadJobs={uploadJobs}
            onUploadMultipleFiles={placeUploadedFiles}
            onRemoveCylinderSlot={handleRemoveCylinderSlot}
          />
        </div>
      )}

      {/* =====================================================================
          STEP 3: 3D PREVIEW & FINE-TUNE ADJUSTMENTS
          ===================================================================== */}
      {currentStep === 'preview' && (
        <main className="app-stage">
          <section className="viewport-stage">
            <PhotoPlacementBoard
              slots={cylinderSlots}
              shape={settings.shape}
              widthMm={settings.width}
              heightMm={settings.height}
              stripLayout={settings.stripLayout}
              cylinderDiameter={settings.cylinderDiameter || 90}
              cubeWidth={settings.cubeWidth || 90}
              onOffsetChange={handleUpdateSlotOffset}
              open={placementOpen}
              onOpenChange={setPlacementOpen}
            />
            <Viewport3D
              geometryData={geometryData}
              settings={settings}
              isGenerating={isGenerating}
            />
          </section>

          <ControlPanel
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onUpdateWidth={handleUpdateWidth}
            onResetSettings={handleResetSettings}
            onOpenCrop={() => {
              if (!cylinderSlots[0]?.imageSrc) return;
              setCropTargetSlotId(cylinderSlots[0]?.id ?? null);
              setShowCropModal(true);
            }}
            onUploadClick={() => fileInputRef.current?.click()}
            onOpenSlicingGuide={() => setShowSlicingModal(true)}
            aspectRatio={processedImage?.aspectRatio || 1.33}
            previewDataUrl={processedImage?.previewDataUrl || null}
            cylinderSlots={cylinderSlots}
            onOpenCropSlot={(slotId) => {
              setCropTargetSlotId(slotId);
              setShowCropModal(true);
            }}
            onUploadSlotClick={(slotId) => {
              targetUploadSlotIdRef.current = slotId;
              slotFileInputRef.current?.click();
            }}
            onReorderCylinderSlots={(newSlots) => setCylinderSlots(newSlots)}
            onMatchCylinderHeightToPhoto={handleMatchCylinderHeightToPhoto}
            onPlacePhotos={() => setPlacementOpen(true)}
          />
        </main>
      )}

      <nav className="step-bar" aria-label="Steps">
        {currentStep !== 'mode' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCurrentStep(currentStep === 'preview' ? 'upload' : 'mode')}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span>Back</span>
          </button>
        )}
        {currentStep === 'preview' ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowValidationModal(true)}
            disabled={!orderReady}
            title={orderReady ? 'Export the model' : 'Wait for the model to finish'}
          >
            <span>Export</span>
            <Download className="h-4 w-4 shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() =>
              currentStep === 'mode' ? setCurrentStep('upload') : handleStepChange('preview')
            }
            disabled={
              (currentStep === 'mode' && !shapeChosen) ||
              (currentStep === 'upload' && !photosReady)
            }
            title={
              currentStep === 'mode' && !shapeChosen
                ? 'Choose a shape first'
                : currentStep === 'upload' && !photosReady
                ? 'Add a photo first'
                : undefined
            }
          >
            <span>Next</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
        )}
      </nav>

      {/* Modals */}
      {showValidationModal && geometryData && validationResult && (
        <ValidationModal
          geometryData={geometryData}
          validationResult={validationResult}
          settings={settings}
          imageName={exportName}
          emailExportEnabled={emailExportEnabled}
          printOrderingEnabled={printOrderingEnabled}
          orderReady={orderReady}
          onOrderPrint={() => {
            setShowValidationModal(false);
            setShowOrderModal(true);
          }}
          onClose={() => setShowValidationModal(false)}
        />
      )}

      {showCropModal && (
        <CropModal
          imageSrc={activeCropImageSrc}
          initialCrop={activeCropInitial}
          physicalWidthMm={Math.round(cropSpanMm)}
          targetAspect={lockCropToTile ? cropTileAspect : undefined}
          targetAspectLabel={
            lockCropToTile
              ? photoCount === 1
                ? isCubeShape
                  ? '4-face wrap'
                  : isCylinderShape
                  ? '360° wrap'
                  : 'Full panel'
                : isStripShape
                ? cropCellLabel || 'Tile'
                : `Tile (${cropTileAspect}:1)`
              : undefined
          }
          onApplyCrop={handleApplyCrop}
          onClose={() => {
            setShowCropModal(false);
            setCropTargetSlotId(null);
          }}
        />
      )}

      {showSlicingModal && (
        <SlicingModal onClose={() => setShowSlicingModal(false)} />
      )}

      {showOrderModal && geometryData && (
        <OrderPrintModal
          geometryData={geometryData}
          imageName={exportName}
          onClose={() => setShowOrderModal(false)}
        />
      )}
    </div>
  );
}
