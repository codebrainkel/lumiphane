import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LithophaneSettings,
  MeshGeometryData,
  MeshValidationResult,
  ImageCropData,
  SamplePresetImage,
} from './types/lithophane';
import {
  DEFAULT_SETTINGS,
  SAMPLE_IMAGES,
  ULTRA_FINE_RESOLUTION,
  getAutoScaledThickness,
  getResolutionForTier,
} from './constants/presets';
import { ImageProcessor, ProcessedImageResult } from './services/imageProcessor';
import { GeometryGenerator } from './services/geometryGenerator';
import { MeshValidator } from './services/meshValidator';
import { Header } from './components/Header';
import { Viewport3D } from './components/Viewport3D';
import { ControlPanel } from './components/ControlPanel';
import { ValidationModal } from './components/ValidationModal';
import { CropModal } from './components/CropModal';
import { SlicingModal } from './components/SlicingModal';
import { Upload, AlertCircle, FileImage, ShieldCheck } from 'lucide-react';

export default function App() {
  const [settings, setSettings] = useState<LithophaneSettings>(DEFAULT_SETTINGS);
  const [imageSrc, setImageSrc] = useState<string>(SAMPLE_IMAGES[0].url);
  const [imageName, setImageName] = useState<string>('golden_retriever');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [cropData, setCropData] = useState<ImageCropData | null>(null);

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
  const debounceTimerRef = useRef<number | null>(null);

  // 1. Load Image element when imageSrc changes
  useEffect(() => {
    let isCancelled = false;
    ImageProcessor.loadImage(imageSrc)
      .then((img) => {
        if (!isCancelled) {
          setLoadedImage(img);
          setErrorMessage(null);
          // Auto adjust physical height to match source aspect ratio
          const nw = img.naturalWidth || img.width;
          const nh = img.naturalHeight || img.height;
          const aspect = cropData ? cropData.width / cropData.height : nw / nh;
          const autoHeight = Math.max(10, Math.round(settings.width / aspect));
          const autoThickness = getAutoScaledThickness(settings.width, autoHeight);
          setSettings((prev) => ({ ...prev, height: autoHeight, ...autoThickness }));
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Image load failed:', err);
          setErrorMessage('Failed to load image. Please try uploading another image format (PNG, JPEG, WebP).');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [imageSrc]);

  // 2. Debounced Pipeline Trigger
  const runPipeline = useCallback(() => {
    if (!loadedImage) return;

    setIsGenerating(true);
    setErrorMessage(null);

    // Run asynchronously to allow UI to render spinner
    setTimeout(() => {
      try {
        // Step A: Process Image Luminance at calibrated resolution (Master Quality = 600+ cols, ~0.18-0.20mm pitch)
        const cols = getResolutionForTier(settings.qualityTier || 'master', settings.width);
        const processed = ImageProcessor.processImage(loadedImage, settings, cols, cropData);
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
      } catch (err: unknown) {
        console.error('Generation pipeline error:', err);
        setErrorMessage(
          'Geometry generation error: ' + (err instanceof Error ? err.message : String(err))
        );
      } finally {
        setIsGenerating(false);
      }
    }, 40);
  }, [loadedImage, settings, cropData]);

  // Trigger pipeline whenever settings, image, or crop changes (with 80ms debounce)
  useEffect(() => {
    if (!loadedImage) return;

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
  }, [loadedImage, settings, cropData, runPipeline]);

  // File Upload Handlers
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('Image size is too large (max 50MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setImageSrc(result);
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        setImageName(nameWithoutExt);
        setCropData(null); // Reset crop for new image
      }
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read file from disk.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Drag and Drop
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
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleSelectSample = (sample: SamplePresetImage) => {
    setImageSrc(sample.url);
    setImageName(sample.id);
    setCropData(null);
  };

  const handleApplyCrop = (newCrop: ImageCropData | null) => {
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

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden bg-[#090b10] text-slate-100 font-sans antialiased"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.svg"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top Bar Header */}
      <Header
        onExportClick={() => setShowValidationModal(true)}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      {/* Drag & Drop Visual Scrim */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-40 bg-amber-500/20 backdrop-blur-sm border-2 border-dashed border-amber-400 flex items-center justify-center pointer-events-none">
          <div className="bg-[#12151e] border border-white/10 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <Upload className="w-6 h-6 text-amber-400 animate-bounce" />
            <div className="text-sm font-semibold text-white">
              Drop your image anywhere to generate 3D Lithophane
            </div>
          </div>
        </div>
      )}

      {/* Error Alert Banner if any */}
      {errorMessage && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-red-300 z-20">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-white text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace (Split Viewport + Sidebar) */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Central 3D Viewport Area */}
        <section className="flex-1 relative flex flex-col h-full overflow-hidden bg-[#090b10]">
          <Viewport3D
            geometryData={geometryData}
            settings={settings}
            isGenerating={isGenerating}
          />
        </section>

        {/* Right-Hand Settings & Controls Sidebar */}
        <ControlPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onUpdateWidth={handleUpdateWidth}
          onResetSettings={handleResetSettings}
          onSelectSample={handleSelectSample}
          onOpenCrop={() => setShowCropModal(true)}
          onUploadClick={() => fileInputRef.current?.click()}
          onOpenExport={() => setShowValidationModal(true)}
          onOpenSlicingGuide={() => setShowSlicingModal(true)}
          aspectRatio={processedImage?.aspectRatio || 1.33}
          previewDataUrl={processedImage?.previewDataUrl || null}
        />
      </main>

      {/* Modals */}
      {showValidationModal && geometryData && validationResult && (
        <ValidationModal
          geometryData={geometryData}
          validationResult={validationResult}
          settings={settings}
          imageName={imageName}
          onClose={() => setShowValidationModal(false)}
        />
      )}

      {showCropModal && (
        <CropModal
          imageSrc={imageSrc}
          initialCrop={cropData}
          physicalWidthMm={settings.width}
          onApplyCrop={handleApplyCrop}
          onClose={() => setShowCropModal(false)}
        />
      )}

      {showSlicingModal && (
        <SlicingModal onClose={() => setShowSlicingModal(false)} />
      )}
    </div>
  );
}
