import React, { useEffect, useRef, useState } from 'react';
import { MeshValidationResult, MeshGeometryData, LithophaneSettings } from '../types/lithophane';
import { BAMBU_PRINTERS, DEFAULT_BAMBU_PRINTER_ID, getBambuPrinter } from '../constants/bambuPrinters';
import {
  ThreeMfExporter,
  ThreeMfExportResult,
  EmbeddedBambuProfile,
  loadEmbeddedBambuProfile,
} from '../services/threeMfExporter';
import { StlExporter } from '../services/stlExporter';
import { isIosDevice, makeShareFile, saveBlob } from '../services/saveFile';
import {
  Check,
  Download,
  FileArchive,
  Layers,
  Box,
  X,
  Printer,
  FileCheck,
  AlertTriangle,
} from 'lucide-react';

interface ValidationModalProps {
  geometryData: MeshGeometryData;
  validationResult: MeshValidationResult;
  settings: LithophaneSettings;
  imageName: string;
  onClose: () => void;
}

export type ExportFormatType = 'bambu-project' | 'universal' | 'stl';

export const ValidationModal: React.FC<ValidationModalProps> = ({
  geometryData,
  validationResult,
  settings,
  imageName,
  onClose,
}) => {
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('bambu-project');
  const [bambuPrinterId, setBambuPrinterId] = useState(DEFAULT_BAMBU_PRINTER_ID);
  const [bambuProfile, setBambuProfile] = useState<EmbeddedBambuProfile | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingFile, setPendingFile] = useState(false);
  const pendingShareRef = useRef<File | null>(null);
  const [verified3Mf, setVerified3Mf] = useState<{
    hasRun: boolean;
    isValid: boolean;
    sizeKb: number;
    unit: string;
    parsedVertices: number;
    parsedTriangles: number;
    isBambuProject?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEmbeddedBambuProfile()
      .then((profile) => {
        if (!cancelled) setBambuProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setExportError('The saved Bambu Studio profile could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearPendingFile = () => {
    pendingShareRef.current = null;
    setPendingFile(false);
  };

  const holdForTap = (blob: Blob, filename: string) => {
    pendingShareRef.current = makeShareFile(blob, filename);
    setPendingFile(true);
  };

  const deliverFile = async (blob: Blob, filename: string) => {
    const outcome = await saveBlob(blob, filename);
    if (outcome === 'needs-tap') {
      holdForTap(blob, filename);
      return;
    }
    clearPendingFile();
  };

  const handleSavePending = () => {
    const shareFile = pendingShareRef.current;
    if (!shareFile || typeof navigator.share !== 'function') {
      setExportError('This iPhone could not open the share sheet.');
      return;
    }
    // Share has to start before any other work, or Safari reloads the page.
    const pending = navigator.share({ files: [shareFile], title: shareFile.name });
    pendingShareRef.current = null;
    setPendingFile(false);
    setExportError(null);
    pending.catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      pendingShareRef.current = shareFile;
      setPendingFile(true);
      setExportError('The share sheet could not open. Tap Download and try again.');
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      clearPendingFile();
      setExportError(null);

      if (exportFormat === 'stl') {
        const result = StlExporter.exportBinaryStl(geometryData, imageName);
        await deliverFile(result.blob, result.filename);
        return;
      }

      const isBambu = exportFormat === 'bambu-project';
      const result: ThreeMfExportResult = await ThreeMfExporter.export3MF(
        geometryData,
        imageName,
        {
          mode: isBambu ? 'bambu-project' : 'universal',
          bambuPrinterId: isBambu ? bambuPrinterId : undefined,
        }
      );

      const verification = await ThreeMfExporter.verify3MfPackage(result.blob);
      if (!verification.isValid) {
        setVerified3Mf(null);
        setExportError(verification.errors[0] || 'The 3MF package failed verification.');
        return;
      }

      setVerified3Mf({
        hasRun: true,
        isValid: verification.isValid,
        sizeKb: Math.round(result.filesizeBytes / 1024),
        unit: verification.unit,
        parsedVertices: verification.parsedVertexCount,
        parsedTriangles: verification.parsedTriangleCount,
        isBambuProject: result.isBambuProject,
      });

      // Building the 3MF uses await, so the original tap is over. iPhone Safari
      // will flash and drop a download started from here. Hand the file to a new tap.
      if (isIosDevice()) {
        holdForTap(result.blob, result.filename);
        return;
      }

      await deliverFile(result.blob, result.filename);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="modal-scrim">
      <div className="modal-dialog">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 className="text-base font-semibold text-white tracking-tight">
              Export 3D Model
            </h2>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              Ready for your 3D printer · Select format below
            </div>
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
        <div className="modal-body p-5 space-y-4">
          {/* Integrity Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-md bg-[#141924] border border-white/10">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Box className="w-3.5 h-3.5" />
                <span>Dimensions</span>
              </div>
              <div className="font-mono tabular-nums text-xs font-semibold text-white">
                {validationResult.dimensionsMm.width} × {validationResult.dimensionsMm.height} mm
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Depth: {validationResult.dimensionsMm.depth} mm
              </div>
            </div>

            <div className="p-3 rounded-md bg-[#141924] border border-white/10">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <span>Thickness</span>
              </div>
              <div className="font-mono tabular-nums text-xs font-bold text-amber-400">
                {settings.minThickness.toFixed(2)} – {settings.maxThickness.toFixed(2)} mm
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Min to max relief
              </div>
            </div>

            <div className="p-3 rounded-md bg-[#141924] border border-white/10">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Layers className="w-3.5 h-3.5" />
                <span>3D Polygons</span>
              </div>
              <div className="font-mono tabular-nums text-xs font-bold text-white">
                {validationResult.triangleCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                ~{validationResult.estimatedWeightGrams.toFixed(1)}g filament
              </div>
            </div>

            <div className="p-3 rounded-md bg-[#141924] border border-white/10">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Print Status</span>
              </div>
              <div className="font-mono tabular-nums text-xs font-bold text-emerald-400">
                Print Ready
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Watertight solid
              </div>
            </div>
          </div>

          {/* Export Target Selector */}
          <div>
            <div className="text-xs font-bold text-slate-300 uppercase font-mono mb-2">
              Choose File Format
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Bambu Studio Project */}
              <button
                type="button"
                onClick={() => {
                  setExportFormat('bambu-project');
                  clearPendingFile();
                }}
                className={`p-3 text-left rounded-md border transition-colors ${
                  exportFormat === 'bambu-project'
                    ? 'bg-[#181e28] border-amber-400 ring-1 ring-amber-400'
                    : 'bg-[#141924] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>Bambu Studio Project</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-400">Direct</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Native 3MF project with the saved Bambu Studio print profile.
                </p>
              </button>

              {/* Option 2: Universal 3MF */}
              <button
                type="button"
                onClick={() => {
                  setExportFormat('universal');
                  clearPendingFile();
                }}
                className={`p-3 text-left rounded-md border transition-colors ${
                  exportFormat === 'universal'
                    ? 'bg-[#181e28] border-amber-400 ring-1 ring-amber-400'
                    : 'bg-[#141924] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <FileCheck className="w-3.5 h-3.5 text-slate-300" />
                    <span>Standard 3MF</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Standard</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Modern 3D file for OrcaSlicer, PrusaSlicer, Cura, and other programs.
                </p>
              </button>

              {/* Option 3: Binary STL */}
              <button
                type="button"
                onClick={() => {
                  setExportFormat('stl');
                  clearPendingFile();
                }}
                className={`p-3 text-left rounded-md border transition-colors ${
                  exportFormat === 'stl'
                    ? 'bg-[#181e28] border-amber-400 ring-1 ring-amber-400'
                    : 'bg-[#141924] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <FileArchive className="w-3.5 h-3.5 text-slate-300" />
                    <span>Standard STL</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Classic</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Classic 3D printing format compatible with all 3D printers and software.
                </p>
              </button>
            </div>

            {exportFormat === 'bambu-project' && (
              <div className="mt-3 p-3 rounded-md bg-[#141924] border border-white/10 space-y-2.5">
                <label className="block">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    Printer
                  </span>
                  <select
                    value={bambuPrinterId}
                    onChange={(event) => {
                      setBambuPrinterId(event.target.value);
                      setVerified3Mf(null);
                      setExportError(null);
                      clearPendingFile();
                    }}
                    className="mt-1.5 w-full rounded-md border border-white/10 bg-[#10141d] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-amber-400"
                    style={{ colorScheme: 'dark' }}
                  >
                    {BAMBU_PRINTERS.map((printer) => (
                      <option key={printer.id} value={printer.id}>
                        {printer.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-[11px] text-slate-400">
                  {bambuProfile
                    ? `${getBambuPrinter(bambuPrinterId).bedWidth} × ${getBambuPrinter(bambuPrinterId).bedDepth} mm plate · ${bambuProfile.layerHeight} mm layers · ${bambuProfile.infillDensity} infill · ${bambuProfile.brimWidth} mm brim`
                    : 'Loading the saved Bambu Studio profile…'}
                </div>
              </div>
            )}
          </div>

          {/* Slicer Readiness Checklist */}
          <div className="p-3.5 rounded-md bg-[#141924] border border-white/10 space-y-2.5">
            <div className="text-xs font-semibold text-slate-300 tracking-wide uppercase font-mono">
              Pre-Print Quality Check
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-start gap-2 text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Watertight solid mesh with closed edges (no holes or gaps)</span>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Correct surface direction for realistic backlight simulation</span>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Stands upright on the build plate (Z = 0) with stabilizing base</span>
              </div>
              <div className="flex items-start gap-2 text-slate-300">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>Accurate millimeter dimensions for 1:1 real-world size</span>
              </div>
            </div>

            {validationResult.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                {validationResult.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Package Verification Notice */}
          {exportError && (
            <div className="p-3 rounded-md bg-red-950/40 border border-red-500/30 text-xs text-red-300">
              {exportError}
            </div>
          )}

          {pendingFile && (
            <div className="p-3 rounded-md bg-[#141924] border border-amber-400/40 text-xs text-slate-200">
              The 3MF is ready. Tap <span className="font-semibold text-white">Download</span>, then choose Save to Files.
            </div>
          )}

          {verified3Mf && (
            <div className="p-3 rounded-md bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>
                  File Ready ({verified3Mf.sizeKb} KB · {verified3Mf.parsedVertices.toLocaleString()} points)
                </span>
              </div>
              <span className="font-mono text-emerald-400">Unit: mm</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/10 bg-[#10141d]">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
          <button
            type="button"
            onClick={pendingFile ? handleSavePending : handleExport}
            disabled={isExporting}
            className="btn-primary"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isExporting
                ? 'Preparing file…'
                : pendingFile
                ? 'Download'
                : exportFormat === 'bambu-project'
                ? 'Download Bambu Studio File (.3mf)'
                : exportFormat === 'universal'
                ? 'Download .3mf File'
                : 'Download .stl File'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
