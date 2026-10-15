import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LithophaneSettings,
  MeshGeometryData,
  MeshValidationResult,
  ImageCropData,
  SamplePresetImage,
  CylinderSlot,
  AppStep,
} from './types/lithophane';
import {
  DEFAULT_SETTINGS,
  DEFAULT_CYLINDER_SLOTS,
  SAMPLE_IMAGES,
  getAutoScaledThickness,
  getResolutionForTier,
  getCylinderResolutionForTier,
  getCylinderSlotLabels,
  getOptimalCylinderWrapRatio,
  getCubeResolutionForTier,
  getCubeSlotLabels,
  getOptimalCubeWrapRatio,
  getMultiPanelSlotLabels,
  getOptimalMultiPanelWrapRatio,
} from './constants/presets';
import { ImageProcessor, ProcessedImageResult } from './services/imageProcessor';
import { GeometryGenerator } from './services/geometryGenerator';
import { MeshValidator } from './services/meshValidator';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ModeSelector } from './components/ModeSelector';
import { PhotoUploader } from './components/PhotoUploader';
import { Viewport3D } from './components/Viewport3D';
import { ControlPanel } from './components/ControlPanel';
import { ValidationModal } from './components/ValidationModal';
import { CropModal } from './components/CropModal';
import { SlicingModal } from './components/SlicingModal';
import { Upload, AlertCircle } from 'lucide-react';

export default function App() {
  // Stepper Flow: 'mode' -> 'upload' -> 'preview'
  const [currentStep, setCurrentStep] = useState<AppStep>('mode');

  // Core Lithophane Settings
  const [settings, setSettings] = useState<LithophaneSettings>(DEFAULT_SETTINGS);

  // Single Photo State (for Flat / Curved modes)
  const [imageSrc, setImageSrc] = useState<string>(SAMPLE_IMAGES[0].url);
  const [imageName, setImageName] = useState<string>('golden_retriever');
  const [hasOwnPhoto, setHasOwnPhoto] = useState(false);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [cropData, setCropData] = useState<ImageCropData | null>(null);

  // Cylinder 4-Photo Quadrants State
  const [cylinderSlots, setCylinderSlots] = useState<CylinderSlot[]>(DEFAULT_CYLINDER_SLOTS);
  const [loadedCylinderImages, setLoadedCylinderImages] = useState<Record<string, HTMLImageElement>>({});

  // Active Crop Target (null for single photo, or slotId string for cylinder slot)
  const [cropTargetSlotId, setCropTargetSlotId] = useState<string | null>(null);

  // Active Upload Target (for slot replace click)
  const [targetUploadSlotId, setTargetUploadSlotId] = useState<string | null>(null);

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
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // =========================================================================
  // 1. Load Images
  // =========================================================================

  // A. Single image load (flat / curved)
  useEffect(() => {
    let isCancelled = false;
    ImageProcessor.loadImage(imageSrc)
      .then((img) => {
        if (!isCancelled) {
          setLoadedImage(img);
          setErrorMessage(null);
          if (settings.shape !== 'cylinder' && settings.shape !== 'cube') {
            const nw = img.naturalWidth || img.width;
            const nh = img.naturalHeight || img.height;
            const aspect = cropData ? cropData.width / cropData.height : nw / nh;
            const autoHeight = Math.max(10, Math.round(settings.width / aspect));
            const autoThickness = getAutoScaledThickness(settings.width, autoHeight);
            setSettings((prev) => ({ ...prev, height: autoHeight, ...autoThickness }));
          }
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

  // B. Multi-panel (cylinder / cube) 1 to 4 images load
  useEffect(() => {
    if (settings.shape !== 'cylinder' && settings.shape !== 'cube') return;

    let isCancelled = false;
    const promises = cylinderSlots.map((slot) =>
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
  }, [cylinderSlots, settings.shape]);

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
          // Process single image for Flat or Curved mode
          if (!loadedImage) {
            setIsGenerating(false);
            return;
          }
          const cols = getResolutionForTier(settings.qualityTier || 'master', settings.width);
          processed = ImageProcessor.processImage(loadedImage, settings, cols, cropData);
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
    const isMulti = settings.shape === 'cylinder' || settings.shape === 'cube';
    if (!isMulti && !loadedImage) return;
    if (isMulti) {
      if (cylinderSlots.length === 0) return;
      const allLoaded = cylinderSlots.every((s) => !!loadedCylinderImages[s.id]);
      if (!allLoaded) return;
    }

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

  // Single File Upload
  const handleSingleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setImageSrc(result);
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setImageName(nameWithoutExt);
        setHasOwnPhoto(true);
        setCropData(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Cylinder Slot Upload
  const handleUploadCylinderSlotFile = (slotId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setCylinderSlots((prev) =>
          prev.map((s) =>
            s.id === slotId ? { ...s, imageSrc: result, name: nameWithoutExt, cropData: null } : s
          )
        );
        setHasOwnPhoto(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSetCylinderSlotCount = (newCount: number) => {
    const clampedCount = Math.max(1, Math.min(4, newCount));
    setSettings((prev) => ({
      ...prev,
      cylinderPanelCount: clampedCount,
      cubePanelCount: clampedCount,
    }));

    setCylinderSlots((prev) => {
      const labels = getMultiPanelSlotLabels(settings.shape, clampedCount);
      let updated: CylinderSlot[];

      if (prev.length === clampedCount) {
        updated = prev.map((s, i) => ({
          ...s,
          label: `${labels[i].label} (${labels[i].deg})`,
        }));
      } else if (prev.length < clampedCount) {
        // Expand: keep existing, add default/sample images
        const additional: CylinderSlot[] = [];
        for (let i = prev.length; i < clampedCount; i++) {
          const sample = SAMPLE_IMAGES[i % SAMPLE_IMAGES.length];
          const defaultSlot = DEFAULT_CYLINDER_SLOTS[i] || {
            id: `slot_${i + 1}`,
            label: `${labels[i].label} (${labels[i].deg})`,
            name: sample.name,
            imageSrc: sample.url,
            cropData: null,
          };
          additional.push({
            ...defaultSlot,
            id: `slot_${i + 1}`,
            label: `${labels[i].label} (${labels[i].deg})`,
          });
        }
        updated = [...prev, ...additional];
      } else {
        // Shrink: keep first clampedCount slots
        updated = prev.slice(0, clampedCount).map((s, i) => ({
          ...s,
          label: `${labels[i].label} (${labels[i].deg})`,
        }));
      }
      return updated;
    });
  };

  const handleAddCylinderSlot = () => {
    if (cylinderSlots.length < 4) {
      handleSetCylinderSlotCount(cylinderSlots.length + 1);
    }
  };

  const handleRemoveCylinderSlot = (slotId: string) => {
    if (cylinderSlots.length <= 1) return;
    const remaining = cylinderSlots.filter((s) => s.id !== slotId);
    const newCount = remaining.length;
    setSettings((prev) => ({
      ...prev,
      cylinderPanelCount: newCount,
      cubePanelCount: newCount,
    }));
    const labels = getMultiPanelSlotLabels(settings.shape, newCount);
    const updated = remaining.map((s, i) => ({
      ...s,
      label: `${labels[i].label} (${labels[i].deg})`,
    }));
    setCylinderSlots(updated);
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
    setSettings((prev) => ({ ...prev, height: autoHeight, ...autoThickness }));
  };

  // Multi-File Upload (supports 1 to 4 files, automatically sets slot count)
  const handleUploadMultipleCylinderFiles = (files: FileList) => {
    const count = Math.min(files.length, 4);
    if (count === 0) return;

    handleSetCylinderSlotCount(count);

    for (let i = 0; i < count; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const slotId = `slot_${i + 1}`;
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          setCylinderSlots((prev) =>
            prev.map((s, idx) =>
              idx === i ? { ...s, imageSrc: result, name: nameWithoutExt, cropData: null } : s
            )
          );
        }
      };
      reader.readAsDataURL(file);
    }
    setHasOwnPhoto(true);
  };

  const handleUpdateCylinderSlot = (slotId: string, updates: Partial<CylinderSlot>) => {
    setCylinderSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...updates } : s))
    );
  };

  const handleResetCylinderSlots = () => {
    setCylinderSlots(DEFAULT_CYLINDER_SLOTS);
    setSettings((prev) => ({ ...prev, cylinderPanelCount: DEFAULT_CYLINDER_SLOTS.length }));
  };

  const handleSelectSample = (sample: SamplePresetImage) => {
    setImageSrc(sample.url);
    setImageName(sample.id);
    setHasOwnPhoto(false);
    setCropData(null);
  };

  const handleApplyCrop = (newCrop: ImageCropData | null) => {
    if (cropTargetSlotId) {
      // Apply crop to specific cylinder slot
      setCylinderSlots((prev) =>
        prev.map((s) => (s.id === cropTargetSlotId ? { ...s, cropData: newCrop } : s))
      );
    } else {
      // Apply crop to single photo
      setCropData(newCrop);
      const aspect = newCrop
        ? newCrop.width / newCrop.height
        : loadedImage
        ? (loadedImage.naturalWidth || loadedImage.width) / (loadedImage.naturalHeight || loadedImage.height)
        : 1.33;
      const autoHeight = Math.max(10, Math.round(settings.width / aspect));
      const autoThickness = getAutoScaledThickness(settings.width, autoHeight);
      setSettings((prev) => ({
        ...prev,
        height: autoHeight,
        ...autoThickness,
      }));
    }
  };

  const handleUpdateWidth = (newWidth: number) => {
    const clampedW = Math.max(40, Math.min(260, Math.round(newWidth)));
    const aspect = cropData
      ? cropData.width / cropData.height
      : loadedImage
      ? (loadedImage.naturalWidth || loadedImage.width) / (loadedImage.naturalHeight || loadedImage.height)
      : (processedImage?.aspectRatio || 1.33);
    const newH = Math.max(10, Math.round(clampedW / aspect));
    const autoThickness = getAutoScaledThickness(clampedW, newH);
    setSettings((prev) => ({
      ...prev,
      width: clampedW,
      height: newH,
      ...autoThickness,
    }));
  };

  const handleUpdateSettings = (newSettings: Partial<LithophaneSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleResetSettings = () => {
    const aspect = loadedImage
      ? (loadedImage.naturalWidth || loadedImage.width) / (loadedImage.naturalHeight || loadedImage.height)
      : DEFAULT_SETTINGS.width / DEFAULT_SETTINGS.height;
    const defaultH = Math.max(10, Math.round(DEFAULT_SETTINGS.width / aspect));
    const autoThickness = getAutoScaledThickness(DEFAULT_SETTINGS.width, defaultH);
    setSettings({
      ...DEFAULT_SETTINGS,
      height: defaultH,
      ...autoThickness,
    });
    setCropData(null);
  };

  // Drag and drop file handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (settings.shape === 'cylinder' && e.dataTransfer.files.length > 1) {
      handleUploadMultipleCylinderFiles(e.dataTransfer.files);
    } else {
      const file = e.dataTransfer.files?.[0];
      if (file) handleSingleFileUpload(file);
    }
  };

  // Active crop image data
  const activeCropImageSrc = cropTargetSlotId
    ? cylinderSlots.find((s) => s.id === cropTargetSlotId)?.imageSrc || imageSrc
    : imageSrc;
  const activeCropInitial = cropTargetSlotId
    ? cylinderSlots.find((s) => s.id === cropTargetSlotId)?.cropData || null
    : cropData;

  return (
    <div
      className="app-shell"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
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
          if (file) handleSingleFileUpload(file);
        }}
      />
      <input
        ref={slotFileInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && targetUploadSlotId) {
            handleUploadCylinderSlotFile(targetUploadSlotId, file);
          }
        }}
      />

      {/* Top Bar Header with 3-Step Navigation Stepper */}
      <Header
        currentStep={currentStep}
        onStepChange={(st) => setCurrentStep(st)}
        shape={settings.shape}
        hasOwnPhoto={hasOwnPhoto}
        onExportClick={() => setShowValidationModal(true)}
        onUploadClick={() => setCurrentStep('upload')}
      />

      {/* Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xs border-2 border-dashed border-amber-400 flex items-center justify-center pointer-events-none px-6">
          <div className="p-4 bg-[#10141d] border border-amber-400/50 rounded-lg shadow-xl flex items-center gap-3 text-slate-100">
            <Upload className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-sm font-bold">
              Drop photo file(s) to load into lithophane
            </div>
          </div>
        </div>
      )}

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
            className="shrink-0 px-2 py-0.5 text-xs font-mono font-medium text-red-400 hover:text-red-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          STEP 1: CHOOSE MODE
          ===================================================================== */}
      {currentStep === 'mode' && (
        <div className="flex-1 overflow-y-auto pb-14">
          <ModeSelector
            selectedShape={settings.shape}
            onSelectShape={(shape) => {
              setSettings((prev) => ({
                ...prev,
                shape,
                ...(shape === 'cylinder'
                  ? { cylinderDiameter: prev.cylinderDiameter || 90, height: 95 }
                  : shape === 'cube'
                  ? { cubeWidth: prev.cubeWidth || 90, height: 90 }
                  : {}),
              }));
            }}
            onContinue={() => setCurrentStep('upload')}
          />
        </div>
      )}

      {/* =====================================================================
          STEP 2: PROMPT IMAGE UPLOAD (1 or 4 images based on mode)
          ===================================================================== */}
      {currentStep === 'upload' && (
        <div className="flex-1 overflow-y-auto pb-14">
          <PhotoUploader
            shape={settings.shape}
            singleImageSrc={imageSrc}
            singleImageName={imageName}
            hasOwnPhoto={hasOwnPhoto}
            onUploadSingleFile={handleSingleFileUpload}
            onSelectSample={handleSelectSample}
            onOpenCropSingle={() => {
              setCropTargetSlotId(null);
              setShowCropModal(true);
            }}
            singleCropData={cropData}
            singleAspectRatio={processedImage?.aspectRatio || 1.33}

            cylinderSlots={cylinderSlots}
            cylinderDiameter={settings.cylinderDiameter || 90}
            cubeWidth={settings.cubeWidth || 90}
            cylinderHeight={settings.height || 95}
            onUpdateCylinderSlot={handleUpdateCylinderSlot}
            onUploadCylinderSlotFile={handleUploadCylinderSlotFile}
            onUploadMultipleFiles={handleUploadMultipleCylinderFiles}
            onResetCylinderToDefaults={handleResetCylinderSlots}
            onReorderCylinderSlots={(newSlots) => setCylinderSlots(newSlots)}
            onSetCylinderSlotCount={handleSetCylinderSlotCount}
            onAddCylinderSlot={handleAddCylinderSlot}
            onRemoveCylinderSlot={handleRemoveCylinderSlot}
            onMatchCylinderHeightToPhoto={handleMatchCylinderHeightToPhoto}
            onOpenCropSlot={(slotId) => {
              setCropTargetSlotId(slotId);
              setShowCropModal(true);
            }}

            onBackToMode={() => setCurrentStep('mode')}
            onContinueToPreview={() => setCurrentStep('preview')}
          />
        </div>
      )}

      {/* =====================================================================
          STEP 3: 3D PREVIEW & FINE-TUNE ADJUSTMENTS
          ===================================================================== */}
      {currentStep === 'preview' && (
        <main className="app-stage pb-13">
          <section className="viewport-stage">
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
            onSelectSample={handleSelectSample}
            onOpenCrop={() => {
              setCropTargetSlotId(null);
              setShowCropModal(true);
            }}
            hasOwnPhoto={hasOwnPhoto}
            onUploadClick={() => fileInputRef.current?.click()}
            onOpenExport={() => setShowValidationModal(true)}
            onOpenSlicingGuide={() => setShowSlicingModal(true)}
            aspectRatio={processedImage?.aspectRatio || 1.33}
            previewDataUrl={processedImage?.previewDataUrl || null}
            activeSampleId={imageName}
            cylinderSlots={cylinderSlots}
            onOpenCropSlot={(slotId) => {
              setCropTargetSlotId(slotId);
              setShowCropModal(true);
            }}
            onUploadSlotClick={(slotId) => {
              setTargetUploadSlotId(slotId);
              slotFileInputRef.current?.click();
            }}
            onNavigateToUploadStep={() => setCurrentStep('upload')}
            onSetCylinderSlotCount={handleSetCylinderSlotCount}
            onMatchCylinderHeightToPhoto={handleMatchCylinderHeightToPhoto}
          />
        </main>
      )}

      {/* Fixed Bottom Navigation Footer */}
      <BottomNav
        currentStep={currentStep}
        onStepChange={(st) => setCurrentStep(st)}
        shape={settings.shape}
      />

      {/* Modals */}
      {showValidationModal && geometryData && validationResult && (
        <ValidationModal
          geometryData={geometryData}
          validationResult={validationResult}
          settings={settings}
          imageName={settings.shape === 'cylinder' ? 'cylinder_lithophane_360' : imageName}
          onClose={() => setShowValidationModal(false)}
        />
      )}

      {showCropModal && (
        <CropModal
          imageSrc={activeCropImageSrc}
          initialCrop={activeCropInitial}
          physicalWidthMm={
            settings.shape === 'cylinder'
              ? Math.round((Math.PI * (settings.cylinderDiameter || 90)) / (cylinderSlots.length || 1))
              : settings.width
          }
          targetAspect={
            settings.shape === 'cylinder'
              ? getOptimalCylinderWrapRatio(
                  settings.cylinderDiameter || 90,
                  settings.height || 95,
                  cylinderSlots.length || 1
                )
              : undefined
          }
          targetAspectLabel={
            settings.shape === 'cylinder'
              ? cylinderSlots.length === 1
                ? '360° Wrap'
                : `Side (${getOptimalCylinderWrapRatio(
                    settings.cylinderDiameter || 90,
                    settings.height || 95,
                    cylinderSlots.length || 1
                  )}:1)`
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
    </div>
  );
}
