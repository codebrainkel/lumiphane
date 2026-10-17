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
import { isIosDevice, saveBlob } from '../services/saveFile';
import {
  emailTooLargeMessage,
  formatByteSize,
  isValidRecipientEmail,
  maxEmailAttachmentBytes,
  resolveEmailedFormat,
  type EmailAttachmentFormat,
} from '../services/emailExport';
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
  Mail,
} from 'lucide-react';

interface ValidationModalProps {
  geometryData: MeshGeometryData;
  validationResult: MeshValidationResult;
  settings: LithophaneSettings;
  imageName: string;
  emailExportEnabled?: boolean;
  printOrderingEnabled?: boolean;
  orderReady?: boolean;
  onOrderPrint?: () => void;
  onClose: () => void;
}

export type ExportFormatType = 'bambu-project' | 'universal' | 'stl';

const EMAIL_BYTE_LIMIT = maxEmailAttachmentBytes();
const EMAIL_LIMIT_LABEL = formatByteSize(EMAIL_BYTE_LIMIT);

function exportSubtitle(email: boolean, order: boolean): string {
  if (email && order) return 'Download the file, email it to yourself, or order a print';
  if (email) return 'Download the file or email it to yourself';
  if (order) return 'Download the file or order a print';
  return 'Choose a format and save the file';
}

function downloadLabel(format: ExportFormatType, pending: boolean, exporting: boolean): string {
  if (exporting) return 'Preparing file…';
  if (pending) return 'Download';
  return format === 'stl' ? 'Download .stl' : 'Download .3mf';
}

export const ValidationModal: React.FC<ValidationModalProps> = ({
  geometryData,
  validationResult,
  settings,
  imageName,
  emailExportEnabled = false,
  printOrderingEnabled = false,
  orderReady = false,
  onOrderPrint,
  onClose,
}) => {
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('bambu-project');
  const [emailFormat, setEmailFormat] = useState<EmailAttachmentFormat>('3mf');
  const [emailAddress, setEmailAddress] = useState('');
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailing, setIsEmailing] = useState(false);
  const [bambuPrinterId, setBambuPrinterId] = useState(DEFAULT_BAMBU_PRINTER_ID);
  const [bambuProfile, setBambuProfile] = useState<EmbeddedBambuProfile | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingFile, setPendingFile] = useState(false);
  const pendingBlobRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const emailFormatTouched = useRef(false);
  const emailAbortRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    return () => {
      emailAbortRef.current?.abort();
    };
  }, []);

  const clearPendingFile = () => {
    pendingBlobRef.current = null;
    setPendingFile(false);
  };

  const holdForTap = (blob: Blob, filename: string) => {
    pendingBlobRef.current = { blob, filename };
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
    const pendingSave = pendingBlobRef.current;
    if (!pendingSave || typeof navigator.share !== 'function') {
      setExportError('This iPhone could not open the share sheet.');
      return;
    }
    const shareFile = new File([pendingSave.blob], pendingSave.filename, { type: 'application/zip' });
    const pending = navigator.share({ files: [shareFile], title: pendingSave.filename });
    setExportError(null);
    pending.catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setExportError('The share sheet could not open. Tap Download and try again.');
    });
  };

  const selectDownloadFormat = (format: ExportFormatType) => {
    setExportFormat(format);
    setVerified3Mf(null);
    setExportError(null);
    clearPendingFile();
    if (!emailFormatTouched.current) {
      setEmailFormat(format === 'stl' ? 'stl' : '3mf');
    }
  };

  const createModelFile = async (format: ExportFormatType): Promise<
    | { ok: true; blob: Blob; filename: string; isBambuProject?: boolean; verification: null }
    | {
        ok: true;
        blob: Blob;
        filename: string;
        isBambuProject?: boolean;
        verification: Awaited<ReturnType<typeof ThreeMfExporter.verify3MfPackage>>;
      }
    | { ok: false; message: string }
  > => {
    if (format === 'stl') {
      const result = StlExporter.exportBinaryStl(geometryData, imageName);
      return { ok: true, blob: result.blob, filename: result.filename, verification: null };
    }

    const isBambu = format === 'bambu-project';
    const result: ThreeMfExportResult = await ThreeMfExporter.export3MF(geometryData, imageName, {
      mode: isBambu ? 'bambu-project' : 'universal',
      bambuPrinterId: isBambu ? bambuPrinterId : undefined,
    });

    // Opening the finished 3MF again to verify it crashes iPhone Safari.
    if (isIosDevice()) {
      return {
        ok: true,
        blob: result.blob,
        filename: result.filename,
        isBambuProject: result.isBambuProject,
        verification: null,
      };
    }

    const verification = await ThreeMfExporter.verify3MfPackage(result.blob);
    if (!verification.isValid) {
      return { ok: false, message: verification.errors[0] || 'The 3MF package failed verification.' };
    }
    return {
      ok: true,
      blob: result.blob,
      filename: result.filename,
      isBambuProject: result.isBambuProject,
      verification,
    };
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      clearPendingFile();
      setExportError(null);

      const built = await createModelFile(exportFormat);
      if (!built.ok) {
        setVerified3Mf(null);
        setExportError(built.message);
        return;
      }

      if (exportFormat === 'stl') {
        await deliverFile(built.blob, built.filename);
        return;
      }

      if (isIosDevice()) {
        setVerified3Mf({
          hasRun: true,
          isValid: true,
          sizeKb: Math.round(built.blob.size / 1024),
          unit: 'millimeter',
          parsedVertices: geometryData.vertices.length / 3,
          parsedTriangles: geometryData.indices.length / 3,
          isBambuProject: built.isBambuProject,
        });
        holdForTap(built.blob, built.filename);
        return;
      }

      if (!built.verification) {
        setVerified3Mf(null);
        setExportError('The 3MF package failed verification.');
        return;
      }

      setVerified3Mf({
        hasRun: true,
        isValid: built.verification.isValid,
        sizeKb: Math.round(built.blob.size / 1024),
        unit: built.verification.unit,
        parsedVertices: built.verification.parsedVertexCount,
        parsedTriangles: built.verification.parsedTriangleCount,
        isBambuProject: built.isBambuProject,
      });

      await deliverFile(built.blob, built.filename);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleEmail = async () => {
    const recipient = emailAddress.trim();
    if (!isValidRecipientEmail(recipient)) {
      setEmailNotice(null);
      setEmailError('Enter a valid email address.');
      return;
    }

    const controller = new AbortController();
    emailAbortRef.current?.abort();
    emailAbortRef.current = controller;

    try {
      setIsEmailing(true);
      setEmailError(null);
      setEmailNotice(null);

      const format = resolveEmailedFormat(emailFormat, exportFormat);
      const built = await createModelFile(format);
      if (controller.signal.aborted) return;
      if (!built.ok) {
        setEmailError(built.message);
        return;
      }
      if (built.blob.size > EMAIL_BYTE_LIMIT) {
        setEmailError(emailTooLargeMessage(EMAIL_BYTE_LIMIT));
        return;
      }

      // Send the blob itself. Copying a finished 3MF into a File for the share
      // sheet is what crashes iPhone Safari, and email does not need that sheet.
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `send${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
      const response = await fetch('/api/email-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Recipient-Email': recipient,
          'X-Export-Format': format === 'stl' ? 'stl' : '3mf',
          'X-Model-Filename': built.filename,
          'X-Idempotency-Key': idempotencyKey,
        },
        body: built.blob,
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const fallback =
          response.status === 413
            ? 'This file is too large to email. Download it instead.'
            : response.status === 502 || response.status === 503 || response.status === 504
              ? 'The email service is unavailable right now. Download the file instead.'
              : 'The email could not be sent. Download the file instead.';
        setEmailError(payload?.message || fallback);
        return;
      }
      setEmailNotice(`Sent to ${recipient}. The file is attached to that email.`);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setEmailError(err instanceof Error ? err.message : 'The email could not be sent.');
    } finally {
      if (!controller.signal.aborted) setIsEmailing(false);
    }
  };

  const emailedFormat = resolveEmailedFormat(emailFormat, exportFormat);
  const emailFormatHint =
    emailedFormat === 'bambu-project'
      ? `Emails the Bambu Studio 3MF selected above. Limit ${EMAIL_LIMIT_LABEL}.`
      : emailedFormat === 'universal'
        ? `Emails a standard 3MF. Limit ${EMAIL_LIMIT_LABEL}.`
        : `Emails a binary STL. Limit ${EMAIL_LIMIT_LABEL}.`;
  const showOrder = printOrderingEnabled && Boolean(onOrderPrint);

  return (
    <div className="modal-scrim">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div>
            <h2 id="export-title" className="text-base font-semibold text-white tracking-tight">
              Export
            </h2>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {exportSubtitle(emailExportEnabled, showOrder)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body p-5 space-y-4">
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

          <div>
            <div className="text-xs font-bold text-slate-300 uppercase font-mono mb-2">
              Choose File Format
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => selectDownloadFormat('bambu-project')}
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

              <button
                type="button"
                onClick={() => selectDownloadFormat('universal')}
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

              <button
                type="button"
                onClick={() => selectDownloadFormat('stl')}
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
                    className="mt-1.5 w-full rounded-md border border-white/10 bg-[#10141d] px-2.5 py-2 text-base sm:text-xs text-slate-200 outline-none focus:border-amber-400"
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

          {emailExportEnabled && (
            <div className="p-3.5 rounded-md bg-[#141924] border border-white/10 space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-200">Send to my email</div>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">
                  The file is attached to one email. Lumiphane does not keep a copy.
                </p>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-300">Email address</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  maxLength={254}
                  value={emailAddress}
                  placeholder="you@example.com"
                  aria-invalid={emailError ? true : undefined}
                  onChange={(event) => {
                    setEmailAddress(event.target.value);
                    setEmailError(null);
                    setEmailNotice(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleEmail();
                    }
                  }}
                  className="mt-1.5 w-full rounded-md border border-white/10 bg-[#10141d] px-3 py-2.5 text-base text-slate-100 outline-none focus:border-amber-400"
                />
              </label>
              <div>
                <span id="email-format-label" className="text-[11px] font-medium text-slate-300">
                  Attachment
                </span>
                <div className="seg-grid grid-cols-2 mt-1.5" role="group" aria-labelledby="email-format-label">
                  <button
                    type="button"
                    data-on={emailFormat === '3mf'}
                    className="seg-btn export-format"
                    onClick={() => {
                      emailFormatTouched.current = true;
                      setEmailFormat('3mf');
                      setEmailError(null);
                    }}
                  >
                    3MF
                  </button>
                  <button
                    type="button"
                    data-on={emailFormat === 'stl'}
                    className="seg-btn export-format"
                    onClick={() => {
                      emailFormatTouched.current = true;
                      setEmailFormat('stl');
                      setEmailError(null);
                    }}
                  >
                    STL
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{emailFormatHint}</p>
              </div>
              <button
                type="button"
                className="btn-secondary export-send"
                onClick={() => void handleEmail()}
                disabled={isEmailing || isExporting || !emailAddress.trim()}
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>{isEmailing ? 'Sending…' : 'Send email'}</span>
              </button>
              {emailError && (
                <div className="text-xs text-red-300" role="alert">
                  {emailError}
                </div>
              )}
              {emailNotice && (
                <div className="text-xs text-emerald-300" role="status">
                  {emailNotice}
                </div>
              )}
            </div>
          )}

          {showOrder && (
            <button
              type="button"
              onClick={onOrderPrint}
              disabled={!orderReady || isExporting || isEmailing}
              className="w-full p-3.5 text-left rounded-md border border-white/10 bg-[#141924] hover:border-white/20 disabled:opacity-45"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                Order a print
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                Treatstock prints this lithophane and ships it to you. You pay Treatstock, not Lumiphane.
              </p>
            </button>
          )}

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

          {exportError && (
            <div className="p-3 rounded-md bg-red-950/40 border border-red-500/30 text-xs text-red-300">
              {exportError}
            </div>
          )}

          {pendingFile && (
            <div className="p-3 rounded-md bg-[#141924] border border-amber-400/40 text-xs text-slate-200">
              The file is ready. Tap <span className="font-semibold text-white">Download</span>, then choose Save to Files.
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

        <div className="export-footer">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button
            type="button"
            onClick={pendingFile ? handleSavePending : handleExport}
            disabled={isExporting || (isEmailing && !pendingFile)}
            className="btn-primary"
            aria-label={
              pendingFile
                ? 'Download the prepared file'
                : exportFormat === 'bambu-project'
                  ? 'Download Bambu Studio file'
                  : exportFormat === 'universal'
                    ? 'Download 3MF file'
                    : 'Download STL file'
            }
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>{downloadLabel(exportFormat, pendingFile, isExporting)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
