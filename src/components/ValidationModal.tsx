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
} from '../services/emailExport';
import {
  Download,
  FileArchive,
  Info,
  X,
  Printer,
  FileCheck,
  AlertTriangle,
  Mail,
} from 'lucide-react';
import { useDialog } from './useDialog';

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

function exportFileLabel(format: ExportFormatType, printerId: string): string {
  if (format === 'stl') return 'STL';
  if (format === 'universal') return 'standard 3MF';
  return `${getBambuPrinter(printerId).label} project`;
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
  const [delivery, setDelivery] = useState<'download' | 'email'>('download');
  const [specsPinned, setSpecsPinned] = useState(false);
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
  const emailAbortRef = useRef<AbortController | null>(null);
  const { dialogRef, onScrimPointerDown } = useDialog(onClose);

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

  useEffect(() => {
    if (!specsPinned) return;
    const close = () => setSpecsPinned(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [specsPinned]);

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
    setExportError(null);
    setEmailError(null);
    setEmailNotice(null);
    clearPendingFile();
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
        setExportError(built.message);
        return;
      }

      if (exportFormat === 'stl') {
        await deliverFile(built.blob, built.filename);
        return;
      }

      if (isIosDevice()) {
        holdForTap(built.blob, built.filename);
        return;
      }

      if (!built.verification) {
        setExportError('The 3MF package failed verification.');
        return;
      }

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

      const format = resolveEmailedFormat(exportFormat === 'stl' ? 'stl' : '3mf', exportFormat);
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

  const emailedFormat = resolveEmailedFormat(exportFormat === 'stl' ? 'stl' : '3mf', exportFormat);
  const emailFormatHint =
    emailedFormat === 'bambu-project'
      ? `Bambu Studio project · limit ${EMAIL_LIMIT_LABEL}`
      : emailedFormat === 'universal'
        ? `Standard 3MF · limit ${EMAIL_LIMIT_LABEL}`
        : `Binary STL · limit ${EMAIL_LIMIT_LABEL}`;
  const showOrder = printOrderingEnabled && Boolean(onOrderPrint);
  const showEmail = emailExportEnabled;
  const path: 'download' | 'email' = showEmail && delivery === 'email' ? 'email' : 'download';
  const busy = isExporting || isEmailing;
  const busyTitle = isEmailing ? 'Sending your file' : 'Preparing your file';
  const busyDetail = isEmailing
    ? `Attaching the ${exportFileLabel(emailedFormat, bambuPrinterId)} for ${emailAddress.trim()}.`
    : `Building the ${exportFileLabel(exportFormat, bambuPrinterId)}.`;
  const statusLabel = !validationResult.isValid
    ? 'Check'
    : validationResult.warnings.length > 0
      ? 'Review'
      : 'Ready';
  const statusTone = !validationResult.isValid
    ? 'text-red-400'
    : validationResult.warnings.length > 0
      ? 'text-amber-400'
      : 'text-emerald-400';

  const printerBlock = (
    <div className="p-3 rounded-md bg-[#141924] border border-white/10 space-y-2.5">
      <label className="block">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
          <Printer className="w-3.5 h-3.5 text-amber-400" />
          Printer
        </span>
        <select
          value={bambuPrinterId}
          onChange={(event) => {
            setBambuPrinterId(event.target.value);
            setExportError(null);
            clearPendingFile();
          }}
          className="mt-1.5 w-full rounded-md border border-white/10 bg-[#10141d] px-2.5 py-2 text-base text-slate-200 outline-none focus:border-amber-400"
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
  );

  const showPrinter = exportFormat === 'bambu-project';

  return (
    <div className="modal-scrim" onPointerDown={onScrimPointerDown}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-dialog relative"
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={busy ? 'export-busy-title' : 'export-title'}
      >
        <div className={`export-shell ${busy ? 'pointer-events-none' : ''}`} aria-hidden={busy || undefined}>
          <div className="relative z-10 flex items-center justify-between px-5 py-3.5 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <h2 id="export-title" className="text-base font-semibold text-white tracking-tight">
                Export
              </h2>
              <span
                className="export-spec"
                data-pinned={specsPinned ? 'true' : undefined}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="export-spec-btn"
                  aria-label="Model details"
                  aria-expanded={specsPinned}
                  onClick={() => setSpecsPinned((open) => !open)}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                <span role="tooltip" className="export-spec-tip">
                  <span>
                    {validationResult.dimensionsMm.width} × {validationResult.dimensionsMm.height} × {validationResult.dimensionsMm.depth} mm
                  </span>
                  <span className="text-amber-400">
                    {settings.minThickness.toFixed(2)}–{settings.maxThickness.toFixed(2)} mm
                  </span>
                  <span>{validationResult.triangleCount.toLocaleString()} polygons</span>
                  <span className={statusTone}>{statusLabel}</span>
                </span>
              </span>
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
            {validationResult.warnings.length > 0 && (
              <div className="space-y-1.5">
                {validationResult.warnings.map((warning, index) => (
                  <div key={index} className="flex items-start gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="export-formats" role="group" aria-label="File format">
              <button
                type="button"
                data-on={exportFormat === 'bambu-project'}
                className="export-format"
                onClick={() => selectDownloadFormat('bambu-project')}
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span>Bambu Studio Project</span>
              </button>
              <button
                type="button"
                data-on={exportFormat === 'universal'}
                className="export-format"
                onClick={() => selectDownloadFormat('universal')}
              >
                <FileCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Standard 3MF</span>
              </button>
              <button
                type="button"
                data-on={exportFormat === 'stl'}
                className="export-format"
                onClick={() => selectDownloadFormat('stl')}
              >
                <FileArchive className="w-3.5 h-3.5 shrink-0" />
                <span>Standard STL</span>
              </button>
            </div>

            <div
              className="export-slot"
              data-active={showPrinter ? 'true' : 'false'}
              inert={showPrinter ? undefined : true}
              aria-hidden={showPrinter ? undefined : true}
            >
              {printerBlock}
            </div>

            {showEmail && (
              <div className="export-tabs" role="tablist" aria-label="How to get the file">
                <button
                  type="button"
                  role="tab"
                  id="export-tab-download"
                  aria-selected={path === 'download'}
                  className="export-tab"
                  onClick={() => setDelivery('download')}
                >
                  Download
                </button>
                <button
                  type="button"
                  role="tab"
                  id="export-tab-email"
                  aria-selected={path === 'email'}
                  aria-controls="export-panel-email"
                  className="export-tab"
                  onClick={() => setDelivery('email')}
                >
                  Email file
                </button>
              </div>
            )}

            {(showEmail || showOrder) && (
              <div className="export-swap">
                <div
                  data-active={path === 'download' ? 'true' : 'false'}
                  inert={path === 'download' ? undefined : true}
                  aria-hidden={path === 'download' ? undefined : true}
                >
                  {showOrder && (
                    <button
                      type="button"
                      onClick={onOrderPrint}
                      disabled={!orderReady || isExporting || isEmailing}
                      className="w-full p-3 text-left rounded-md border border-white/10 bg-[#141924] hover:border-white/20 disabled:opacity-45"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        Order a print
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-snug">
                        Treatstock prints this lithophane and ships it to you. You pay Treatstock, not Lumiphane.
                      </p>
                    </button>
                  )}
                </div>
                {showEmail && (
                  <div
                    id="export-panel-email"
                    role="tabpanel"
                    aria-labelledby="export-tab-email"
                    data-active={path === 'email' ? 'true' : 'false'}
                    inert={path === 'email' ? undefined : true}
                    aria-hidden={path === 'email' ? undefined : true}
                    className="space-y-3"
                  >
                    <p className="text-xs text-slate-400 leading-snug">
                      One email, with the file attached. Lumiphane does not keep a copy.
                    </p>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-300">Email address</span>
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
                    <p className="text-xs leading-snug text-slate-400">{emailFormatHint}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {path === 'email' && emailError && (
            <div className="px-5 pt-3 text-xs text-red-300" role="alert">
              {emailError}
            </div>
          )}
          {path === 'email' && emailNotice && (
            <div className="px-5 pt-3 text-xs text-emerald-300" role="status">
              {emailNotice}
            </div>
          )}
          {path === 'download' && exportError && (
            <div className="px-5 pt-3 text-xs text-red-300" role="alert">
              {exportError}
            </div>
          )}
          {path === 'download' && pendingFile && (
            <div className="px-5 pt-3 text-xs text-slate-200">
              The file is ready. Tap <span className="font-semibold text-white">Download</span>, then choose Save to Files.
            </div>
          )}

          <div className="export-footer">
            {path === 'email' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleEmail()}
                disabled={isEmailing || isExporting || !emailAddress.trim()}
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>{isEmailing ? 'Sending…' : 'Send email'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={pendingFile ? handleSavePending : handleExport}
                disabled={isExporting || isEmailing}
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
            )}
          </div>
        </div>

        {busy && (
          <div className="export-busy" role="status" aria-live="polite">
            <div className="export-busy-bar" aria-hidden="true">
              <span />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="export-busy-close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="export-busy-mark" aria-hidden="true">
              <span className="export-busy-spin" />
            </div>
            <p className="export-busy-kicker">Export</p>
            <h2 id="export-busy-title" className="export-busy-title">
              {busyTitle}
            </h2>
            <p className="export-busy-detail">{busyDetail}</p>
          </div>
        )}
      </div>
    </div>
  );
};
