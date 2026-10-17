export type SaveOutcome = 'saved' | 'cancelled' | 'needs-tap';

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function shareCandidates(blob: Blob, filename: string): string[] {
  const stl = filename.toLowerCase().endsWith('.stl');
  const preferred = stl
    ? ['model/stl', 'application/sla', 'application/octet-stream']
    : ['application/zip', 'model/3mf', blob.type, 'application/octet-stream'];
  return [...new Set(preferred.filter((type): type is string => Boolean(type)))];
}

export function makeShareFile(blob: Blob, filename: string): File {
  const types = shareCandidates(blob, filename);
  for (const type of types) {
    const file = new File([blob], filename, { type });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      return file;
    }
  }
  return new File([blob], filename, { type: types[0] || 'application/octet-stream' });
}

export function canShareFile(file: File): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

export async function sharePreparedFile(file: File): Promise<'saved' | 'cancelled'> {
  await navigator.share({ files: [file], title: file.name });
  return 'saved';
}

export function downloadBlob(blob: Blob, filename: string) {
  const prepared = prepareDownload(blob, filename);
  triggerPreparedDownload(prepared);
}

export interface PreparedDownload {
  filename: string;
  url: string;
  anchor: HTMLAnchorElement;
}

/** Build the link before the tap so iPhone Safari still counts the click as a user gesture. */
export function prepareDownload(blob: Blob, filename: string): PreparedDownload {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.setAttribute('download', filename);
  anchor.style.position = 'fixed';
  anchor.style.left = '-9999px';
  document.body.appendChild(anchor);
  return { filename, url, anchor };
}

export function triggerPreparedDownload(prepared: PreparedDownload) {
  prepared.anchor.click();
  window.setTimeout(() => releasePreparedDownload(prepared), 180_000);
}

export function releasePreparedDownload(prepared: PreparedDownload) {
  prepared.anchor.remove();
  URL.revokeObjectURL(prepared.url);
}

/**
 * Desktop browsers save from the link. iPhone Safari ignores that link and
 * flashes the page, so the file has to go through the system share sheet.
 * If export took long enough to expire the tap, the caller must ask for one
 * more tap and call sharePreparedFile from that gesture.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<SaveOutcome> {
  const file = makeShareFile(blob, filename);
  if (isIosDevice() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'saved';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      return 'needs-tap';
    }
  }

  downloadBlob(blob, filename);
  return 'saved';
}
