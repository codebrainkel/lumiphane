import { AppStep } from '../types/lithophane';

/** Formats the export sheet can build. */
export type TrackedExportFormat = 'bambu-project' | 'universal' | 'stl';

type AnalyticsValue = string | number | boolean;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const STEP_PAGE: Record<AppStep, { path: string; title: string }> = {
  mode: { path: '/', title: 'Choose a shape' },
  upload: { path: '/photos', title: 'Add photos' },
  preview: { path: '/preview', title: 'Preview' },
};

function send(name: string, params: Record<string, AnalyticsValue> = {}) {
  if (typeof window.gtag !== 'function') return;
  const payload: Record<string, AnalyticsValue> = { ...params, transport_type: 'beacon' };
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') payload.debug_mode = true;
  window.gtag('event', name, payload);
}

export function imageContentType(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/gif') return 'gif';
  return 'other';
}

function fileExtension(format: TrackedExportFormat): 'stl' | '3mf' {
  return format === 'stl' ? 'stl' : '3mf';
}

/** One page view per step. The tag itself does not send the automatic hit. */
export function trackStep(step: AppStep) {
  const page = STEP_PAGE[step];
  send('page_view', {
    page_title: page.title,
    page_path: page.path,
    page_location: `${window.location.origin}${page.path}`,
  });
}

export function trackShapeSelect(shape: string) {
  send('shape_select', { shape });
}

/** One event per photo that was actually added. Users on this event are people who uploaded. */
export function trackPhotoUpload(input: { shape: string; contentType: string; method: 'add' | 'replace' }) {
  send('photo_upload', {
    shape: input.shape,
    content_type: input.contentType,
    method: input.method,
  });
}

export function trackPhotoUploadFailed(input: { shape: string; reason: 'not_image' | 'unreadable' }) {
  send('photo_upload_failed', { shape: input.shape, reason: input.reason });
}

export function trackExportOpen(input: { shape: string; photoCount: number }) {
  send('export_open', { shape: input.shape, photo_count: input.photoCount });
}

/**
 * A file the visitor actually received.
 * Event count is downloads. Total users is people who downloaded.
 * file_name stays generic so a photo filename is never sent.
 */
export function trackFileDownload(input: {
  format: TrackedExportFormat;
  method: 'download' | 'share';
  shape: string;
  photoCount: number;
  fallback?: boolean;
}) {
  const extension = fileExtension(input.format);
  send('file_download', {
    file_extension: extension,
    file_name: `lithophane.${extension}`,
    file_format: input.format,
    method: input.method,
    shape: input.shape,
    photo_count: input.photoCount,
    ...(input.fallback ? { fallback: 'stl' } : {}),
  });
}

export function trackEmailExport(input: { format: TrackedExportFormat; shape: string; photoCount: number }) {
  const extension = fileExtension(input.format);
  send('email_export', {
    file_extension: extension,
    file_format: input.format,
    shape: input.shape,
    photo_count: input.photoCount,
  });
}

export function trackExportFailed(input: {
  format: TrackedExportFormat;
  delivery: 'download' | 'email' | 'share';
  shape: string;
}) {
  send('export_failed', {
    file_format: input.format,
    delivery: input.delivery,
    shape: input.shape,
  });
}

export function trackPrintOrderReady(input: { shape: string; photoCount: number }) {
  send('print_order_ready', { shape: input.shape, photo_count: input.photoCount });
}

export function trackPrintCheckout(input: { shape: string; photoCount: number }) {
  send('print_checkout', { shape: input.shape, photo_count: input.photoCount });
}
