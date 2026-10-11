import { LithophaneSettings, ImageCropData } from '../types/lithophane';

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

export class ImageProcessor {
  /**
   * Loads an image from a URL or data URL and returns an HTMLImageElement
   */
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
    cropData?: ImageCropData | null
  ): ProcessedImageResult {
    // 1. Determine source bounds with integer clamping to prevent sub-pixel / odd-size artifacts
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

    // Source aspect ratio strictly dictates grid proportions
    const sourceAspect = sw / sh;
    // Calculate rows based strictly on the image's aspect ratio
    const rows = Math.max(4, Math.round(cols / sourceAspect));

    // 2. High-Fidelity Stepped Multi-Pass Resampling (prevents downsampling aliasing & pixel-skipping)
    const sampledCanvas = this.renderSteppedDownscale(img, sx, sy, sw, sh, cols, rows);
    const ctx = sampledCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context is not available');
    }

    const imgData = ctx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    const luminanceGrid = new Float32Array(cols * rows);

    const bFactor = settings.brightness / 100;
    const cFactor = 1 + settings.contrast / 50;
    const gammaExp = 1 / Math.max(0.1, settings.gamma);

    // 3. Convert RGBA to calibrated ITU-R BT.709 Luminance with 32-bit precision
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        const red = pixels[idx];
        const green = pixels[idx + 1];
        const blue = pixels[idx + 2];
        const alpha = pixels[idx + 3] / 255;

        // ITU-R BT.709 relative luminance
        let lum = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

        // Blend with white if transparent
        if (alpha < 1) {
          lum = lum * alpha + 1.0 * (1 - alpha);
        }

        // Apply Brightness
        lum += bFactor;

        // Apply Contrast centered at 0.5
        lum = (lum - 0.5) * cFactor + 0.5;

        // Clamp
        lum = Math.max(0, Math.min(1, lum));

        // Gamma correction
        lum = Math.pow(lum, gammaExp);

        // Invert if requested
        if (settings.invert) {
          lum = 1.0 - lum;
        }

        luminanceGrid[r * cols + c] = lum;
      }
    }

    // 4. Auto Dynamic Range / Histogram Optimization (utilize full 0.8mm - 3.0mm physical PLA thickness range)
    if (settings.autoLevels) {
      this.applyAutoLevels(luminanceGrid, cols * rows);
    }

    // 5. Optical Micro-Contrast & Edge Sharpening (Unsharp Mask for translucent PLA light transmission)
    const sharpnessAmount = typeof settings.sharpness === 'number' ? settings.sharpness : 20;
    if (sharpnessAmount > 0) {
      this.applyUnsharpMask(luminanceGrid, cols, rows, sharpnessAmount);
    }

    // 6. Optional edge-preserving smoothing pass (removes 3D micro-noise while preserving sharp boundaries)
    if (settings.smoothing > 0) {
      this.applySmoothing(luminanceGrid, cols, rows, settings.smoothing);
    }

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
   * Stepped multi-pass downscaling algorithm.
   * Standard browser drawImage drops intermediate pixel rows when downscaling by >2x.
   * Stepping down in powers of two ensures all high-resolution sensor pixels are accurately averaged.
   */
  private static renderSteppedDownscale(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    targetW: number,
    targetH: number
  ): HTMLCanvasElement {
    // If downscaling ratio is modest (<= 2x in both axes), direct draw is high fidelity
    if (sw <= targetW * 2 && sh <= targetH * 2) {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      }
      return canvas;
    }

    const targetAspect = targetW / targetH;

    // Step 1: Draw cropped region to initial canvas
    let curW = Math.round(sw);
    let curH = Math.round(sh);
    let curCanvas = document.createElement('canvas');
    curCanvas.width = curW;
    curCanvas.height = curH;
    let curCtx = curCanvas.getContext('2d');
    if (curCtx) {
      curCtx.imageSmoothingEnabled = true;
      curCtx.imageSmoothingQuality = 'high';
      curCtx.drawImage(img, sx, sy, sw, sh, 0, 0, curW, curH);
    }

    // Step 2: Halve dimensions step by step preserving target aspect ratio
    while (curW > targetW * 2 || curH > targetH * 2) {
      const nextW = Math.max(targetW, Math.round(curW / 2));
      const nextH = Math.max(targetH, Math.round(nextW / targetAspect));

      const nextCanvas = document.createElement('canvas');
      nextCanvas.width = nextW;
      nextCanvas.height = nextH;
      const nextCtx = nextCanvas.getContext('2d');
      if (nextCtx) {
        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'high';
        nextCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
      }

      curCanvas = nextCanvas;
      curW = nextW;
      curH = nextH;
    }

    // Step 3: Final high-quality draw to target grid resolution
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(curCanvas, 0, 0, curW, curH, 0, 0, targetW, targetH);
    }

    return finalCanvas;
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
    sharpness: number
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
            const nc = c + dc;
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
    level: number
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
              const nc = c + dc;
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
