import { LithophaneSettings, ImageCropData } from '../types/lithophane';
import { resolveStripLayout } from '../constants/presets';

export interface ProcessedImageResult {
  luminanceGrid: Float32Array; // Flattened [row * cols + col], values in [0, 1]
  cols: number;
  rows: number;
  aspectRatio: number; // width / height
  previewDataUrl: string; // Pristine lossless preview image
  sourceResolution: {
    width: number;
    height: number;
    megapixels: number;
  };
  physicalPitchMm: number; // Physical distance between grid sample points in mm
}

/** Long edge of the single stored photo. iOS canvas limits sit at this size. */
export const STORED_LONG_EDGE = 4096;

const LANCZOS_A = 3;

export function cappedSize(
  width: number,
  height: number,
  maxEdge = STORED_LONG_EDGE,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function orientationSwapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/** JPEG APP1 orientation tag (0x0112). Returns 1 when the file has none. */
export function readExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return 1;
    if (marker === 0xe1) {
      const found = orientationFromExif(bytes, offset + 4, length - 2);
      if (found) return found;
    }
    offset += 2 + length;
  }
  return 1;
}

function orientationFromExif(bytes: Uint8Array, start: number, length: number): number {
  if (length < 14) return 0;
  if (bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 || bytes[start + 2] !== 0x69 || bytes[start + 3] !== 0x66) return 0;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return 0;
  const u16 = (p: number) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p: number) =>
    little
      ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
      : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  if (u16(tiff + 2) !== 0x002a) return 0;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > start + length || ifd + 2 > bytes.length) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) return 0;
    if (u16(entry) !== 0x0112) continue;
    const type = u16(entry + 2);
    const n = u32(entry + 4);
    if (n < 1) return 0;
    let value = 0;
    if (type === 3) value = u16(entry + 8);
    else if (type === 4) value = u32(entry + 8);
    else return 0;
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 0;
}

/** Unrotated JPEG pixel size from the SOF marker, or null for other files. */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && length >= 7) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Pixels from createImageBitmap or a canvas are already EXIF-oriented.
 * Chrome ignores imageOrientation 'none' and decodes upright, so running
 * orientRgba on those pixels applies orientations 2, 3, and 4 a second time.
 * `orientation` is accepted so callers record which tag the browser applied.
 */
export function adoptBrowserOrientedPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  orientation: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  void orientation;
  return { rgba, width, height };
}

/** Bakes an EXIF orientation into raw sensor pixels. Orientation 6 is 90° clockwise. */
export function orientRgba(
  src: ArrayLike<number>,
  width: number,
  height: number,
  orientation: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (orientation <= 1 || orientation > 8) {
    const rgba = new Uint8ClampedArray(src.length);
    rgba.set(src);
    return { rgba, width, height };
  }
  const swap = orientationSwapsAxes(orientation);
  const dw = swap ? height : width;
  const dh = swap ? width : height;
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x;
      let dy = y;
      switch (orientation) {
        case 2:
          dx = width - 1 - x;
          break;
        case 3:
          dx = width - 1 - x;
          dy = height - 1 - y;
          break;
        case 4:
          dy = height - 1 - y;
          break;
        case 5:
          dx = y;
          dy = x;
          break;
        case 6:
          dx = height - 1 - y;
          dy = x;
          break;
        case 7:
          dx = height - 1 - y;
          dy = width - 1 - x;
          break;
        default:
          dx = y;
          dy = width - 1 - x;
          break;
      }
      const s = (y * width + x) * 4;
      const d = (dy * dw + dx) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return { rgba: out, width: dw, height: dh };
}

function lanczosKernel(x: number): number {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= LANCZOS_A) return 0;
  const p = Math.PI * x;
  return (LANCZOS_A * Math.sin(p) * Math.sin(p / LANCZOS_A)) / (p * p);
}

function lanczosWeights(srcN: number, dstN: number): { lo: Int32Array; coeffs: Float32Array; taps: number } {
  const scale = srcN / dstN;
  const support = LANCZOS_A * Math.max(1, scale);
  const norm = Math.max(1, scale);
  let taps = 0;
  const lo = new Int32Array(dstN);
  const widths: number[] = [];
  for (let i = 0; i < dstN; i++) {
    const c = (i + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.floor(c - support));
    const end = Math.min(srcN - 1, Math.ceil(c + support));
    lo[i] = start;
    const n = end - start + 1;
    widths.push(n);
    if (n > taps) taps = n;
  }
  const coeffs = new Float32Array(dstN * taps);
  for (let i = 0; i < dstN; i++) {
    const c = (i + 0.5) * scale - 0.5;
    const start = lo[i];
    const n = widths[i];
    let sum = 0;
    const row = i * taps;
    for (let k = 0; k < n; k++) {
      const v = lanczosKernel((start + k - c) / norm);
      coeffs[row + k] = v;
      sum += v;
    }
    if (sum !== 0) {
      for (let k = 0; k < n; k++) coeffs[row + k] /= sum;
    }
  }
  return { lo, coeffs, taps };
}

/**
 * Separable Lanczos-3 (a = 3) in sRGB bytes, matching the tone-map input.
 * Output channels are clamped to [0, 255].
 */
export function lanczosResize(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  originX = 0,
  originY = 0,
  stride = sw,
): Uint8ClampedArray {
  const cropW = Math.max(1, sw | 0);
  const cropH = Math.max(1, sh | 0);
  const outW = Math.max(1, dw | 0);
  const outH = Math.max(1, dh | 0);
  const wx = lanczosWeights(cropW, outW);
  const wy = lanczosWeights(cropH, outH);
  const tmp = new Float32Array(outW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const row = ((originY + y) * stride + originX) * 4;
    const tmpRow = y * outW * 4;
    for (let x = 0; x < outW; x++) {
      const base = wx.lo[x];
      const coeff = x * wx.taps;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < wx.taps; k++) {
        const wk = wx.coeffs[coeff + k];
        if (wk === 0) continue;
        const i = row + (base + k) * 4;
        r += src[i] * wk;
        g += src[i + 1] * wk;
        b += src[i + 2] * wk;
        a += src[i + 3] * wk;
      }
      const o = tmpRow + x * 4;
      tmp[o] = r;
      tmp[o + 1] = g;
      tmp[o + 2] = b;
      tmp[o + 3] = a;
    }
  }
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const base = wy.lo[y];
    const coeff = y * wy.taps;
    for (let x = 0; x < outW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < wy.taps; k++) {
        const wk = wy.coeffs[coeff + k];
        if (wk === 0) continue;
        const i = ((base + k) * outW + x) * 4;
        r += tmp[i] * wk;
        g += tmp[i + 1] * wk;
        b += tmp[i + 2] * wk;
        a += tmp[i + 3] * wk;
      }
      const o = (y * outW + x) * 4;
      out[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      out[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      out[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      out[o + 3] = a < 0 ? 0 : a > 255 ? 255 : a;
    }
  }
  return out;
}

/** Exact 2× box. Both dimensions must be even. Each output pixel is the mean of a 2×2 block. */
function boxDown2(src: Float32Array, width: number, height: number): Float32Array {
  const dw = width >> 1;
  const dh = height >> 1;
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const r0 = (y * 2) * width;
    const r1 = r0 + width;
    const dst = y * dw;
    for (let x = 0; x < dw; x++) {
      const x2 = x * 2;
      out[dst + x] = (src[r0 + x2] + src[r0 + x2 + 1] + src[r1 + x2] + src[r1 + x2 + 1]) * 0.25;
    }
  }
  return out;
}

function lanczosFromLuminance(lum: Float32Array, cropW: number, cropH: number, outW: number, outH: number): Float32Array {
  const wx = lanczosWeights(cropW, outW);
  const wy = lanczosWeights(cropH, outH);
  // Pad each row by a full tap so a short border window never reads the next row.
  const xtaps = wx.taps;
  const rowStride = cropW + xtaps;
  const lumSrc = new Float32Array(rowStride * cropH);
  for (let y = 0; y < cropH; y++) {
    lumSrc.set(lum.subarray(y * cropW, y * cropW + cropW), y * rowStride);
  }
  const tmp = new Float32Array(outW * cropH);
  const xcoeff = wx.coeffs;
  const xlo = wx.lo;
  for (let y = 0; y < cropH; y++) {
    const row = y * rowStride;
    const tmpRow = y * outW;
    for (let x = 0; x < outW; x++) {
      const base = xlo[x];
      const coeff = x * xtaps;
      let acc = 0;
      let k = 0;
      const n = xtaps;
      for (; k + 3 < n; k += 4) {
        acc +=
          lumSrc[row + base + k] * xcoeff[coeff + k] +
          lumSrc[row + base + k + 1] * xcoeff[coeff + k + 1] +
          lumSrc[row + base + k + 2] * xcoeff[coeff + k + 2] +
          lumSrc[row + base + k + 3] * xcoeff[coeff + k + 3];
      }
      for (; k < n; k++) acc += lumSrc[row + base + k] * xcoeff[coeff + k];
      tmp[tmpRow + x] = acc;
    }
  }
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const base = wy.lo[y];
    const coeff = y * wy.taps;
    const dst = y * outW;
    for (let x = 0; x < outW; x++) {
      let acc = 0;
      for (let k = 0; k < wy.taps; k++) {
        const wk = wy.coeffs[coeff + k];
        if (wk === 0) continue;
        acc += tmp[(base + k) * outW + x] * wk;
      }
      out[dst + x] = acc < 0 ? 0 : acc > 1 ? 1 : acc;
    }
  }
  return out;
}

/**
 * Lanczos-3 of Rec.709 sRGB luminance, alpha composited on white first.
 * Same color space the tone map already consumes. Output is clamped to [0, 1].
 * Exact 2× box reductions run while halving would still leave the crop at
 * least 3× the grid, then one Lanczos-3 pass. Pass prefilter=false for the
 * single-pass kernel.
 */
export function lanczosResizeLuminance(
  rgba: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  originX = 0,
  originY = 0,
  stride = sw,
  prefilter = true,
): Float32Array {
  const cropW = Math.max(1, sw | 0);
  const cropH = Math.max(1, sh | 0);
  const outW = Math.max(1, dw | 0);
  const outH = Math.max(1, dh | 0);
  let lum = new Float32Array(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    const row = ((originY + y) * stride + originX) * 4;
    const dst = y * cropW;
    for (let x = 0; x < cropW; x++) {
      const i = row + x * 4;
      const alpha = rgba[i + 3] / 255;
      let sample = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
      if (alpha < 1) sample = sample * alpha + (1 - alpha);
      lum[dst + x] = sample;
    }
  }
  let srcW = cropW;
  let srcH = cropH;
  if (prefilter) {
    // Another exact 2× box only while the reduced image is still at least 3×
    // the grid. Lanczos-3 then removes what the box would otherwise alias.
    while (srcW >= outW * 6 && srcH >= outH * 6 && (srcW & 1) === 0 && (srcH & 1) === 0) {
      lum = boxDown2(lum, srcW, srcH) as typeof lum;
      srcW >>= 1;
      srcH >>= 1;
    }
  }
  return lanczosFromLuminance(lum, srcW, srcH, outW, outH);
}

const RESAMPLE_CACHE_LIMIT = 2;
const resampleCache = new WeakMap<object, Map<string, Float32Array>>();
const sourcePixelCache = new WeakMap<object, Uint8ClampedArray>();

/** Drop cached pixels and resamples for a photo that has been removed. */
export function releasePhotoCaches(owner: object | null | undefined): void {
  if (!owner) return;
  resampleCache.delete(owner);
  sourcePixelCache.delete(owner);
}

/** Cached grid resample. Two crops are kept per photo; the least recent is dropped. */
export function cachedLuminanceResize(
  owner: object,
  rgba: ArrayLike<number>,
  srcWidth: number,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Float32Array {
  let bucket = resampleCache.get(owner);
  if (!bucket) {
    bucket = new Map();
    resampleCache.set(owner, bucket);
  }
  const key = `${sx}|${sy}|${sw}|${sh}|${dw}|${dh}`;
  const hit = bucket.get(key);
  if (hit) {
    bucket.delete(key);
    bucket.set(key, hit);
    return hit;
  }
  const out = lanczosResizeLuminance(rgba, sw, sh, dw, dh, sx, sy, srcWidth);
  bucket.set(key, out);
  while (bucket.size > RESAMPLE_CACHE_LIMIT) {
    const oldest = bucket.keys().next().value;
    if (oldest === undefined) break;
    bucket.delete(oldest);
  }
  return out;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  const chunk = 0x4000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number, mime: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  const image = new ImageData(width, height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  const png = mime.includes('png');
  return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
}

async function bitmapFromBlob(blob: Blob, resize?: { width: number; height: number }): Promise<ImageBitmap> {
  if (resize && typeof createImageBitmap === 'function') {
    const options = {
      resizeWidth: resize.width,
      resizeHeight: resize.height,
      resizeQuality: 'high',
    } as ImageBitmapOptions;
    return createImageBitmap(blob, options);
  }
  return createImageBitmap(blob);
}

function bitmapToRgba(bitmap: ImageBitmap): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context is not available');
  ctx.drawImage(bitmap, 0, 0);
  const out = new Uint8ClampedArray(bitmap.width * bitmap.height * 4);
  const chunkRows = 256;
  for (let y = 0; y < bitmap.height; y += chunkRows) {
    const rows = Math.min(chunkRows, bitmap.height - y);
    out.set(ctx.getImageData(0, y, bitmap.width, rows).data, y * bitmap.width * 4);
  }
  return out;
}

/**
 * The browser applies EXIF while decoding. Those pixels are stored as-is.
 * A long edge over 4096 is reduced with createImageBitmap resizeQuality 'high'.
 */
async function decodePreparedPhoto(
  bytes: Uint8Array,
  mime: string,
  orientation: number,
  sof: { width: number; height: number } | null,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number; rewritten: boolean }> {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const swaps = orientationSwapsAxes(orientation);
  const orientedW = sof ? (swaps ? sof.height : sof.width) : 0;
  const orientedH = sof ? (swaps ? sof.width : sof.height) : 0;
  const knownCap = orientedW > 0 ? cappedSize(orientedW, orientedH) : null;
  const resizeNow = !!knownCap && (knownCap.width !== orientedW || knownCap.height !== orientedH);
  let didCap = resizeNow;
  let bitmap = await bitmapFromBlob(blob, resizeNow && knownCap ? { width: knownCap.width, height: knownCap.height } : undefined);
  if (!resizeNow) {
    const cap = cappedSize(bitmap.width, bitmap.height);
    if (cap.width !== bitmap.width || cap.height !== bitmap.height) {
      const smaller = await createImageBitmap(bitmap, {
        resizeWidth: cap.width,
        resizeHeight: cap.height,
        resizeQuality: 'high',
      } as ImageBitmapOptions);
      bitmap.close?.();
      bitmap = smaller;
      didCap = true;
    }
  }
  const width = bitmap.width;
  const height = bitmap.height;
  const decoded = bitmapToRgba(bitmap);
  bitmap.close?.();
  const adopted = adoptBrowserOrientedPixels(decoded, width, height, orientation);
  return {
    rgba: adopted.rgba,
    width: adopted.width,
    height: adopted.height,
    rewritten: orientation > 1 || didCap,
  };
}

export class ImageProcessor {
  /**
   * Cover-crop that keeps the middle of the photo.
   * Wider photos lose equal left and right margins. Taller photos lose equal
   * top and bottom margins, so an odd or mismatched frame still shows the
   * vertical center — where the subject usually sits.
   */
  static centeredCoverRect(
    sourceW: number,
    sourceH: number,
    targetAspect: number
  ): { sx: number; sy: number; sw: number; sh: number } {
    const w = Math.max(1, Math.round(sourceW));
    const h = Math.max(1, Math.round(sourceH));
    const aspect = Math.max(0.02, targetAspect);

    let sx = 0;
    let sy = 0;
    let sw = w;
    let sh = h;

    if (w / h > aspect) {
      sh = h;
      sw = Math.max(1, Math.min(w, Math.round(h * aspect)));
      sx = Math.round((w - sw) / 2);
    } else {
      sw = w;
      sh = Math.max(1, Math.min(h, Math.round(w / aspect)));
      sy = Math.round((h - sh) / 2);
    }

    sx = Math.max(0, Math.min(w - sw, sx));
    sy = Math.max(0, Math.min(h - sh, sy));
    return { sx, sy, sw, sh };
  }

  /**
   * Window before any slide. A saved crop keeps its rectangle. Otherwise the
   * frame is a centered cover crop of the target aspect.
   */
  static baseSourceRect(
    sourceW: number,
    sourceH: number,
    targetAspect: number,
    cropData?: ImageCropData | null
  ): { sx: number; sy: number; sw: number; sh: number } {
    const w = Math.max(1, Math.round(sourceW));
    const h = Math.max(1, Math.round(sourceH));
    if (cropData && cropData.width > 0 && cropData.height > 0) {
      const sx = Math.max(0, Math.min(w - 1, Math.floor(cropData.x)));
      const sy = Math.max(0, Math.min(h - 1, Math.floor(cropData.y)));
      const sw = Math.max(1, Math.min(w - sx, Math.round(cropData.width)));
      const sh = Math.max(1, Math.min(h - sy, Math.round(cropData.height)));
      return { sx, sy, sw, sh };
    }
    return this.centeredCoverRect(w, h, targetAspect);
  }

  /**
   * Slides a window inside the photo.
   * Positive offsetY moves the photo up (the window travels down).
   * Positive offsetX moves the photo right (the window travels left).
   * Each axis is -1..1, as a fraction of the room remaining on that side.
   */
  static shiftSourceRect(
    rect: { sx: number; sy: number; sw: number; sh: number },
    sourceW: number,
    sourceH: number,
    offsetX = 0,
    offsetY = 0
  ): { sx: number; sy: number; sw: number; sh: number } {
    const w = Math.max(1, Math.round(sourceW));
    const h = Math.max(1, Math.round(sourceH));
    const sw = Math.max(1, Math.min(w, rect.sw));
    const sh = Math.max(1, Math.min(h, rect.sh));
    const sx0 = Math.max(0, Math.min(w - sw, rect.sx));
    const sy0 = Math.max(0, Math.min(h - sh, rect.sy));
    const ox = Math.max(-1, Math.min(1, offsetX || 0));
    const oy = Math.max(-1, Math.min(1, offsetY || 0));

    const slackLeft = sx0;
    const slackRight = Math.max(0, w - (sx0 + sw));
    const slackTop = sy0;
    const slackBottom = Math.max(0, h - (sy0 + sh));

    let sx = sx0;
    let sy = sy0;
    if (oy >= 0) sy = sy0 + oy * slackBottom;
    else sy = sy0 + oy * slackTop;
    if (ox >= 0) sx = sx0 - ox * slackLeft;
    else sx = sx0 - ox * slackRight;

    sx = Math.max(0, Math.min(w - sw, Math.round(sx)));
    sy = Math.max(0, Math.min(h - sh, Math.round(sy)));
    return { sx, sy, sw, sh };
  }

  /** Cover or crop window after the photo has been slid inside its frame. */
  static resolveSourceRect(
    sourceW: number,
    sourceH: number,
    targetAspect: number,
    cropData?: ImageCropData | null,
    offsetX = 0,
    offsetY = 0
  ): { sx: number; sy: number; sw: number; sh: number } {
    const base = this.baseSourceRect(sourceW, sourceH, targetAspect, cropData);
    return this.shiftSourceRect(base, sourceW, sourceH, offsetX, offsetY);
  }

  /**
   * Inverse of shiftSourceRect. Maps a dragged window back to -1..1 offsets
   * relative to the unshifted base window.
   */
  static offsetsForWindow(
    base: { sx: number; sy: number; sw: number; sh: number },
    sourceW: number,
    sourceH: number,
    desiredSx: number,
    desiredSy: number
  ): { offsetX: number; offsetY: number } {
    const w = Math.max(1, Math.round(sourceW));
    const h = Math.max(1, Math.round(sourceH));
    const maxX = Math.max(0, w - base.sw);
    const maxY = Math.max(0, h - base.sh);
    const sx = Math.max(0, Math.min(maxX, desiredSx));
    const sy = Math.max(0, Math.min(maxY, desiredSy));

    const slackLeft = base.sx;
    const slackRight = Math.max(0, w - (base.sx + base.sw));
    const slackTop = base.sy;
    const slackBottom = Math.max(0, h - (base.sy + base.sh));

    let offsetY = 0;
    if (sy >= base.sy) offsetY = slackBottom > 0 ? (sy - base.sy) / slackBottom : 0;
    else offsetY = slackTop > 0 ? (sy - base.sy) / slackTop : 0;

    let offsetX = 0;
    if (sx <= base.sx) offsetX = slackLeft > 0 ? (base.sx - sx) / slackLeft : 0;
    else offsetX = slackRight > 0 ? -(sx - base.sx) / slackRight : 0;

    return {
      offsetX: Math.max(-1, Math.min(1, offsetX)),
      offsetY: Math.max(-1, Math.min(1, offsetY)),
    };
  }

  /**
   * Loads an image from a URL or data URL and returns an HTMLImageElement
   */
  /** Forget cached pixels and resamples when a photo leaves the project. */
  static releasePhoto(owner: object | null | undefined): void {
    releasePhotoCaches(owner);
  }

  static async loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image: ' + e));
      img.src = src;
    });
  }

  /**
   * Processes image pixels into normalized luminance map and returns preview data
   * Uses a 100% lossless, uncompressed pipeline with stepped multi-pass downsampling,
   * 32-bit floating point precision, optical micro-contrast sharpening, and dynamic range preservation.
   */
  static processImage(
    img: HTMLImageElement,
    settings: LithophaneSettings,
    cols: number,
    cropData?: ImageCropData | null,
    offsetX = 0,
    offsetY = 0
  ): ProcessedImageResult {
    // 1. Determine source bounds with integer clamping to prevent sub-pixel / odd-size artifacts
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    // Plate size can differ from the photo. Start from the crop or a centered
    // cover, then slide that window when the photo has room to move.
    const panelAspect = Math.max(10, settings.width) / Math.max(10, settings.height);
    const { sx, sy, sw, sh } = this.resolveSourceRect(
      naturalW,
      naturalH,
      panelAspect,
      cropData,
      offsetX,
      offsetY
    );

    // Source aspect ratio strictly dictates grid proportions
    const sourceAspect = sw / sh;
    // Calculate rows based strictly on the image's aspect ratio
    const rows = Math.max(4, Math.round(cols / sourceAspect));

    // 2. Process image buffer using high-precision optical pipeline
    const fittedCrop: ImageCropData = {
      x: sx,
      y: sy,
      width: sw,
      height: sh,
      aspectRatioMode: cropData?.aspectRatioMode ?? 'custom',
    };
    const luminanceGrid = this.processSingleImageBuffer(img, settings, cols, rows, fittedCrop);

    // 7. Generate Lossless PNG Visual Preview (zero compression artifacts)
    const previewCanvas = document.createElement('canvas');
    const pWidth = Math.min(800, cols * 2);
    const pHeight = Math.max(4, Math.round(pWidth / sourceAspect));
    previewCanvas.width = pWidth;
    previewCanvas.height = pHeight;
    const pCtx = previewCanvas.getContext('2d');
    if (pCtx) {
      const pImgData = pCtx.createImageData(cols, rows);
      for (let i = 0; i < cols * rows; i++) {
        const v = Math.round(luminanceGrid[i] * 255);
        const pIdx = i * 4;
        pImgData.data[pIdx] = v;
        pImgData.data[pIdx + 1] = v;
        pImgData.data[pIdx + 2] = v;
        pImgData.data[pIdx + 3] = 255;
      }
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cols;
      tempCanvas.height = rows;
      tempCanvas.getContext('2d')?.putImageData(pImgData, 0, 0);
      pCtx.imageSmoothingEnabled = true;
      pCtx.imageSmoothingQuality = 'high';
      pCtx.drawImage(tempCanvas, 0, 0, pWidth, pHeight);
    }

    const physicalPitchMm = Math.round((settings.width / cols) * 1000) / 1000;

    return {
      luminanceGrid,
      cols,
      rows,
      aspectRatio: sourceAspect,
      previewDataUrl: previewCanvas.toDataURL('image/png'), // 100% Lossless PNG
      sourceResolution: {
        width: Math.round(sw),
        height: Math.round(sh),
        megapixels: Math.round(((sw * sh) / 1000000) * 10) / 10,
      },
      physicalPitchMm,
    };
  }

  /**
   * Processes 1 to 4 images distributed evenly around a 360° hollow cylinder.
   * - 1 Image: Full 360° panoramic wrap (ideal for wide/panoramic photos or seamless wraps)
   * - 2 Images: 180° halves (Front & Back)
   * - 3 Images: 120° panels (Front, Right, Left)
   * - 4 Images: 90° quadrants (Front, Right, Back, Left)
   */
  static processCylinderImages(
    slots: {
      img: HTMLImageElement;
      cropData?: ImageCropData | null;
      offsetX?: number;
      offsetY?: number;
      label?: string;
      name?: string;
    }[],
    settings: LithophaneSettings,
    targetCols: number
  ): ProcessedImageResult {
    // 1. Determine number of panels (1 to 4, based on slots provided)
    const validSlots = slots.length > 0 ? slots : [{ img: new Image() }];
    const numPanels = Math.max(1, Math.min(4, validSlots.length));

    // Ensure cols is divisible by numPanels (and multiple of 12 for clean division)
    const cols = Math.max(360, Math.round(targetCols / 12) * 12);
    const panelCols = Math.round(cols / numPanels);

    const diameter = Math.max(40, settings.cylinderDiameter || 90);
    const height = Math.max(30, settings.height || 95);
    const circumference = Math.PI * diameter;
    const totalAspect = circumference / height;
    const rows = Math.max(16, Math.round(cols / totalAspect));

    const N = cols * rows;
    const luminanceGrid = new Float32Array(N);

    // Create high-res panorama preview canvas
    const previewCanvas = document.createElement('canvas');
    const pW = Math.max(1600, cols);
    const pH = Math.max(160, Math.round(pW / totalAspect));
    previewCanvas.width = pW;
    previewCanvas.height = pH;
    const pCtx = previewCanvas.getContext('2d');

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    // 2. Sample and map each slot onto its angular sector
    for (let s = 0; s < numPanels; s++) {
      const slot = validSlots[s] || validSlots[0];
      if (!slot || !slot.img) continue;

      const img = slot.img;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const panelAspect = panelCols / rows;
      const { sx, sy, sw, sh } = this.resolveSourceRect(
        naturalW,
        naturalH,
        panelAspect,
        slot.cropData,
        slot.offsetX,
        slot.offsetY
      );

      const sampled = this.resampleLuminance(img, sx, sy, sw, sh, panelCols, rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < panelCols; c++) {
          let lum = sampled[r * panelCols + c];

          lum += bFactor;
          lum = (lum - 0.5) * cFactor + 0.5;
          lum = Math.max(0, Math.min(1, lum));
          lum = Math.pow(lum, gammaExp);

          if (settings.invert) {
            lum = 1.0 - lum;
          }

          const destCol = s * panelCols + c;
          if (destCol < cols) {
            luminanceGrid[r * cols + destCol] = lum;
          }
        }
      }

      // Draw onto visual panorama canvas without artificial divider lines
      if (pCtx) {
        const pPanelW = pW / numPanels;
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(this.luminanceCanvas(sampled, panelCols, rows), s * pPanelW, 0, pPanelW, pH);
      }
    }

    // 3. Post-process full 360° grid with seamless horizontal circular wrapping
    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, N);
    }
    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount, true);
    }
    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing, true);
    }

    const physicalPitchMm = Math.round((circumference / cols) * 1000) / 1000;

    return {
      luminanceGrid,
      cols,
      rows,
      aspectRatio: totalAspect,
      previewDataUrl: previewCanvas.toDataURL('image/png'),
      sourceResolution: {
        width: numPanels * Math.round(panelCols),
        height: rows,
        megapixels: Math.round(((cols * rows) / 1000000) * 10) / 10,
      },
      physicalPitchMm,
    };
  }

  /**
   * Processes 1 to 4 images distributed evenly around the 4 sides of a hollow cube.
   * - 1 Image: Full 4-face wrap around the perimeter
   * - 2 Images: 2 faces each (Front+Right, Back+Left)
   * - 3 Images: 3 panels distributed around perimeter
   * - 4 Images: 1 image per face (Front, Right, Back, Left)
   */
  static processCubeImages(
    slots: {
      img: HTMLImageElement;
      cropData?: ImageCropData | null;
      offsetX?: number;
      offsetY?: number;
      label?: string;
      name?: string;
    }[],
    settings: LithophaneSettings,
    targetCols: number
  ): ProcessedImageResult {
    const validSlots = slots.length > 0 ? slots : [{ img: new Image() }];
    const numPanels = Math.max(1, Math.min(4, validSlots.length));

    // Ensure cols is divisible by 12 (divisible by 1, 2, 3, 4) and multiple of 4
    const cols = Math.max(360, Math.round(targetCols / 12) * 12);
    const panelCols = Math.round(cols / numPanels);

    const cubeWidth = Math.max(40, settings.cubeWidth || 90);
    const height = Math.max(30, settings.height || 90);
    const perimeter = 4 * cubeWidth;
    const totalAspect = perimeter / height;
    const rows = Math.max(16, Math.round(cols / totalAspect));

    const N = cols * rows;
    const luminanceGrid = new Float32Array(N);

    // Create high-res panorama preview canvas
    const previewCanvas = document.createElement('canvas');
    const pW = Math.max(1600, cols);
    const pH = Math.max(160, Math.round(pW / totalAspect));
    previewCanvas.width = pW;
    previewCanvas.height = pH;
    const pCtx = previewCanvas.getContext('2d');

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    for (let s = 0; s < numPanels; s++) {
      const slot = validSlots[s] || validSlots[0];
      if (!slot || !slot.img) continue;

      const img = slot.img;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const panelAspect = panelCols / rows;
      const { sx, sy, sw, sh } = this.resolveSourceRect(
        naturalW,
        naturalH,
        panelAspect,
        slot.cropData,
        slot.offsetX,
        slot.offsetY
      );

      const sampled = this.resampleLuminance(img, sx, sy, sw, sh, panelCols, rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < panelCols; c++) {
          let lum = sampled[r * panelCols + c];

          lum += bFactor;
          lum = (lum - 0.5) * cFactor + 0.5;
          lum = Math.max(0, Math.min(1, lum));
          lum = Math.pow(lum, gammaExp);

          if (settings.invert) {
            lum = 1.0 - lum;
          }

          const destCol = s * panelCols + c;
          if (destCol < cols) {
            luminanceGrid[r * cols + destCol] = lum;
          }
        }
      }

      if (pCtx) {
        const pPanelW = pW / numPanels;
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(this.luminanceCanvas(sampled, panelCols, rows), s * pPanelW, 0, pPanelW, pH);
      }
    }

    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, N);
    }
    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount, true);
    }
    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing, true);
    }

    const physicalPitchMm = Math.round((perimeter / cols) * 1000) / 1000;

    return {
      luminanceGrid,
      cols,
      rows,
      aspectRatio: totalAspect,
      previewDataUrl: previewCanvas.toDataURL('image/png'),
      sourceResolution: {
        width: numPanels * Math.round(panelCols),
        height: rows,
        megapixels: Math.round(((cols * rows) / 1000000) * 10) / 10,
      },
      physicalPitchMm,
    };
  }

  /**
   * Processes 1 to 6 images distributed evenly around the 6 sides of a hollow hexagon.
   * - 1 Image: Full 6-face wrap around the perimeter
   * - 2 Images: 3 faces each (Front 3 Faces, Back 3 Faces)
   * - 3 Images: 2 faces each (Front Pair, Right Pair, Left Pair)
   * - 4 Images: 4 quadrants distributed evenly around the 6-sided perimeter
   * - 5 Images: 5 panels distributed evenly around the 6-sided perimeter
   * - 6 Images: 1 image per flat hexagonal face (Faces 1–6)
   */
  static processHexagonImages(
    slots: {
      img: HTMLImageElement;
      cropData?: ImageCropData | null;
      offsetX?: number;
      offsetY?: number;
      label?: string;
      name?: string;
    }[],
    settings: LithophaneSettings,
    targetCols: number
  ): ProcessedImageResult {
    const validSlots = slots.length > 0 ? slots : [{ img: new Image() }];
    const numPanels = Math.max(1, Math.min(6, validSlots.length));

    // Ensure cols is divisible by 60 (divisible by 6 faces and by 1, 2, 3, 4, 5, 6 panels)
    const cols = Math.max(360, Math.round(targetCols / 60) * 60);
    const panelCols = Math.round(cols / numPanels);

    const hexagonDiameter = Math.max(40, settings.hexagonDiameter || 90);
    const height = Math.max(30, settings.height || 90);
    const perimeter = 3 * hexagonDiameter;
    const totalAspect = perimeter / height;
    const rows = Math.max(16, Math.round(cols / totalAspect));

    const N = cols * rows;
    const luminanceGrid = new Float32Array(N);

    const previewCanvas = document.createElement('canvas');
    const pW = Math.max(1600, cols);
    const pH = Math.max(160, Math.round(pW / totalAspect));
    previewCanvas.width = pW;
    previewCanvas.height = pH;
    const pCtx = previewCanvas.getContext('2d');

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    for (let s = 0; s < numPanels; s++) {
      const slot = validSlots[s] || validSlots[0];
      if (!slot || !slot.img) continue;

      const img = slot.img;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const panelAspect = panelCols / rows;
      const { sx, sy, sw, sh } = this.resolveSourceRect(
        naturalW,
        naturalH,
        panelAspect,
        slot.cropData,
        slot.offsetX,
        slot.offsetY
      );

      const sampled = this.resampleLuminance(img, sx, sy, sw, sh, panelCols, rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < panelCols; c++) {
          let lum = sampled[r * panelCols + c];

          lum += bFactor;
          lum = (lum - 0.5) * cFactor + 0.5;
          lum = Math.max(0, Math.min(1, lum));
          lum = Math.pow(lum, gammaExp);

          if (settings.invert) {
            lum = 1.0 - lum;
          }

          const destCol = s * panelCols + c;
          if (destCol < cols) {
            luminanceGrid[r * cols + destCol] = lum;
          }
        }
      }

      if (pCtx) {
        const pPanelW = pW / numPanels;
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(this.luminanceCanvas(sampled, panelCols, rows), s * pPanelW, 0, pPanelW, pH);
      }
    }

    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, N);
    }
    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount, true);
    }
    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing, true);
    }

    const physicalPitchMm = Math.round((perimeter / cols) * 1000) / 1000;

    return {
      luminanceGrid,
      cols,
      rows,
      aspectRatio: totalAspect,
      previewDataUrl: previewCanvas.toDataURL('image/png'),
      sourceResolution: {
        width: numPanels * Math.round(panelCols),
        height: rows,
        megapixels: Math.round(((cols * rows) / 1000000) * 10) / 10,
      },
      physicalPitchMm,
    };
  }

  /**
   * Tiles 1 to 4 photos across a flat or curved panel using the selected collage.
   * Each photo is cover-cropped from its center so a mismatched photo keeps its middle.
   */
  static processStripImages(
    slots: {
      img: HTMLImageElement;
      cropData?: ImageCropData | null;
      offsetX?: number;
      offsetY?: number;
      label?: string;
      name?: string;
    }[],
    settings: LithophaneSettings,
    targetCols: number
  ): ProcessedImageResult {
    const validSlots = slots.length > 0 ? slots : [{ img: new Image() }];
    const numPanels = Math.max(1, Math.min(4, validSlots.length));
    const layout = resolveStripLayout(settings.stripLayout, numPanels);
    const { gridCols, gridRows, cells } = layout;

    const width = Math.max(10, settings.width);
    const height = Math.max(10, settings.height);
    const totalAspect = width / height;

    const unitCols = Math.max(8, Math.round(Math.max(48, targetCols) / gridCols));
    const unitRows = Math.max(
      8,
      Math.round(Math.max(gridRows * 8, Math.round((unitCols * gridCols) / totalAspect)) / gridRows)
    );
    const cols = unitCols * gridCols;
    const rows = unitRows * gridRows;

    const N = cols * rows;
    const luminanceGrid = new Float32Array(N);

    const previewCanvas = document.createElement('canvas');
    const pW = Math.max(800, cols);
    const pH = Math.max(8, Math.round(pW / totalAspect));
    previewCanvas.width = pW;
    previewCanvas.height = pH;
    const pCtx = previewCanvas.getContext('2d');

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    for (let s = 0; s < numPanels; s++) {
      const slot = validSlots[s] || validSlots[0];
      const block = cells[s] || cells[0];
      if (!slot || !slot.img || !block) continue;

      const img = slot.img;
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const blockCols = block.colSpan * unitCols;
      const blockRows = block.rowSpan * unitRows;
      const panelAspect = blockCols / blockRows;

      const { sx, sy, sw, sh } = this.resolveSourceRect(
        naturalW,
        naturalH,
        panelAspect,
        slot.cropData,
        slot.offsetX,
        slot.offsetY
      );

      const sampled = this.resampleLuminance(img, sx, sy, sw, sh, blockCols, blockRows);
      const destC0 = block.col * unitCols;
      const destR0 = block.row * unitRows;

      for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
          let lum = sampled[r * blockCols + c];

          lum += bFactor;
          lum = (lum - 0.5) * cFactor + 0.5;
          lum = Math.max(0, Math.min(1, lum));
          lum = Math.pow(lum, gammaExp);

          if (settings.invert) {
            lum = 1.0 - lum;
          }

          const destR = destR0 + r;
          const destC = destC0 + c;
          if (destR < rows && destC < cols) {
            luminanceGrid[destR * cols + destC] = lum;
          }
        }
      }

      if (pCtx) {
        const x = Math.round((block.col / gridCols) * pW);
        const y = Math.round((block.row / gridRows) * pH);
        const x2 = Math.round(((block.col + block.colSpan) / gridCols) * pW);
        const y2 = Math.round(((block.row + block.rowSpan) / gridRows) * pH);
        pCtx.imageSmoothingEnabled = true;
        pCtx.imageSmoothingQuality = 'high';
        pCtx.drawImage(this.luminanceCanvas(sampled, blockCols, blockRows), x, y, Math.max(1, x2 - x), Math.max(1, y2 - y));
      }
    }

    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, N);
    }
    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount, false);
    }
    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing, false);
    }

    const physicalPitchMm = Math.round((width / cols) * 1000) / 1000;

    return {
      luminanceGrid,
      cols,
      rows,
      aspectRatio: totalAspect,
      previewDataUrl: previewCanvas.toDataURL('image/png'),
      sourceResolution: {
        width: cols,
        height: rows,
        megapixels: Math.round(((cols * rows) / 1000000) * 10) / 10,
      },
      physicalPitchMm,
    };
  }

  /**
   * Processes a single image into a normalized Float32Array luminance buffer of size (cols * rows).
   */
  static processSingleImageBuffer(
    img: HTMLImageElement,
    settings: LithophaneSettings,
    cols: number,
    rows: number,
    cropData?: ImageCropData | null
  ): Float32Array {
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;

    let sx = 0;
    let sy = 0;
    let sw = naturalW;
    let sh = naturalH;

    if (cropData) {
      sx = Math.max(0, Math.min(naturalW - 1, Math.floor(cropData.x)));
      sy = Math.max(0, Math.min(naturalH - 1, Math.floor(cropData.y)));
      sw = Math.max(1, Math.min(naturalW - sx, Math.round(cropData.width)));
      sh = Math.max(1, Math.min(naturalH - sy, Math.round(cropData.height)));
    }

    const sampled = this.resampleLuminance(img, sx, sy, sw, sh, cols, rows);
    const luminanceGrid = new Float32Array(cols * rows);

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let lum = sampled[r * cols + c];

        lum += bFactor;
        lum = (lum - 0.5) * cFactor + 0.5;
        lum = Math.max(0, Math.min(1, lum));
        lum = Math.pow(lum, gammaExp);

        if (settings.invert) {
          lum = 1.0 - lum;
        }

        luminanceGrid[r * cols + c] = lum;
      }
    }

    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, cols * rows);
    }

    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount);
    }

    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing);
    }

    return luminanceGrid;
  }



  /** Grayscale stand-in for the panorama thumbnail. The tone map uses the same samples. */
  private static luminanceCanvas(lum: Float32Array, cols: number, rows: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, cols);
    canvas.height = Math.max(1, rows);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < cols * rows; i++) {
      const v = Math.round(Math.max(0, Math.min(1, lum[i])) * 255);
      const p = i * 4;
      image.data[p] = v;
      image.data[p + 1] = v;
      image.data[p + 2] = v;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  /**
   * One resample of the crop onto the generator grid. Slider changes that keep
   * the same photo, crop, and grid reuse the cached buffer.
   */
  private static resampleLuminance(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    targetW: number,
    targetH: number,
  ): Float32Array {
    const dw = Math.max(1, targetW | 0);
    const dh = Math.max(1, targetH | 0);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width < 1 || height < 1) {
      const blank = new Float32Array(dw * dh);
      blank.fill(1);
      return blank;
    }
    const rgba = this.readSourceRgba(img, width, height);
    return cachedLuminanceResize(img, rgba, width, sx, sy, sw, sh, dw, dh);
  }

  /** Chunked read so a 4096-long photo stays inside iOS getImageData limits. */
  private static readSourceRgba(img: HTMLImageElement, width: number, height: number): Uint8ClampedArray {
    const cached = sourcePixelCache.get(img);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context is not available');
    ctx.drawImage(img, 0, 0);
    const out = new Uint8ClampedArray(width * height * 4);
    const chunkRows = 256;
    for (let y = 0; y < height; y += chunkRows) {
      const rows = Math.min(chunkRows, height - y);
      out.set(ctx.getImageData(0, y, width, rows).data, y * width * 4);
    }
    sourcePixelCache.set(img, out);
    return out;
  }

  /**
   * The only copy kept after a photo is added. EXIF orientation is baked in,
   * then the long edge is capped at 4096. An upright photo that is already
   * small enough is returned unchanged.
   */
  static async prepareStoredPhoto(bytes: Uint8Array, mime: string): Promise<string> {
    const type = mime || 'image/jpeg';
    const orientation = readExifOrientation(bytes);
    const sof = readJpegSize(bytes);
    const declaredLong = sof ? Math.max(sof.width, sof.height) : 0;
    if (orientation <= 1 && sof && declaredLong <= STORED_LONG_EDGE) {
      return bytesToDataUrl(bytes, type);
    }
    try {
      const prepared = await decodePreparedPhoto(bytes, type, orientation, sof);
      if (!prepared.rewritten) return bytesToDataUrl(bytes, type);
      return rgbaToDataUrl(prepared.rgba, prepared.width, prepared.height, type);
    } catch {
      return bytesToDataUrl(bytes, type);
    }
  }

  /**
   * Dynamic Range / Histogram Optimization:
   * Maps image luminance to fully exploit white PLA's optical dynamic range (0.8mm to 3.0mm)
   * without crushing subtle shadows or blowing highlights.
   */
  private static applyAutoLevels(grid: Float32Array, totalPixels: number): void {
    if (totalPixels === 0) return;

    // Build histogram to find 0.5% and 99.5% percentile bounds
    const hist = new Int32Array(256);
    for (let i = 0; i < totalPixels; i++) {
      const bin = Math.max(0, Math.min(255, Math.round(grid[i] * 255)));
      hist[bin]++;
    }

    const lowerTarget = Math.floor(totalPixels * 0.005);
    const upperTarget = Math.floor(totalPixels * 0.995);

    let count = 0;
    let minBin = 0;
    for (let i = 0; i < 256; i++) {
      count += hist[i];
      if (count >= lowerTarget) {
        minBin = i;
        break;
      }
    }

    count = 0;
    let maxBin = 255;
    for (let i = 255; i >= 0; i--) {
      count += hist[i];
      if (count >= totalPixels - upperTarget) {
        maxBin = i;
        break;
      }
    }

    const minLum = minBin / 255;
    const maxLum = maxBin / 255;
    const span = maxLum - minLum;

    // Only apply if the histogram is compressed and needs expansion
    if (span > 0.05 && (minLum > 0.03 || maxLum < 0.97)) {
      for (let i = 0; i < totalPixels; i++) {
        let val = (grid[i] - minLum) / span;
        grid[i] = Math.max(0, Math.min(1, val));
      }
    }
  }

  /**
   * Unsharp Mask (Micro-Contrast):
   * Boosts high-frequency photographic transitions (hair, eyes, textural detail)
   * to counteract optical light diffusion inside 3D printed translucent plastic.
   */
  private static applyUnsharpMask(
    grid: Float32Array,
    cols: number,
    rows: number,
    sharpness: number,
    wrapX: boolean = false
  ): void {
    const factor = (sharpness / 100) * 1.4;
    if (factor <= 0) return;

    const copy = new Float32Array(grid);

    // 3x3 Gaussian-weighted low-pass filter
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        let weightSum = 0;

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            let nc = c + dc;
            if (wrapX) {
              nc = (nc + cols) % cols;
            }
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              const w = (dr === 0 && dc === 0) ? 4 : (dr === 0 || dc === 0) ? 2 : 1;
              sum += copy[nr * cols + nc] * w;
              weightSum += w;
            }
          }
        }

        const lowPass = sum / weightSum;
        const highPass = copy[r * cols + c] - lowPass;
        // Accentuate high frequencies
        const sharpened = copy[r * cols + c] + highPass * factor;
        grid[r * cols + c] = Math.max(0, Math.min(1, sharpened));
      }
    }
  }

  /**
   * Edge-preserving smoothing filter:
   * Smooths flat regions to eliminate layer noise, while maintaining sharp contrast boundaries.
   */
  private static applySmoothing(
    grid: Float32Array,
    cols: number,
    rows: number,
    level: number,
    wrapX: boolean = false
  ): void {
    const passes = Math.min(2, Math.round(level));
    const copy = new Float32Array(grid);

    for (let pass = 0; pass < passes; pass++) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const centerVal = copy[r * cols + c];
          let sum = 0;
          let weightTotal = 0;

          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr;
              let nc = c + dc;
              if (wrapX) {
                nc = (nc + cols) % cols;
              }
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighborVal = copy[nr * cols + nc];
                const diff = Math.abs(neighborVal - centerVal);
                // Range weight: preserve sharp edges (diff > 0.15)
                const rangeWeight = Math.max(0.1, 1.0 - diff * 4.0);
                const spatialWeight = (dr === 0 && dc === 0) ? 4 : (dr === 0 || dc === 0) ? 2 : 1;
                const totalW = spatialWeight * rangeWeight;

                sum += neighborVal * totalW;
                weightTotal += totalW;
              }
            }
          }
          grid[r * cols + c] = sum / weightTotal;
        }
      }
      copy.set(grid);
    }
  }
}
