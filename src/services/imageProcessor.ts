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

    // 2. Process image buffer using high-precision optical pipeline
    const luminanceGrid = this.processSingleImageBuffer(img, settings, cols, rows, cropData);

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
    slots: { img: HTMLImageElement; cropData?: ImageCropData | null; label?: string; name?: string }[],
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

      let sx = 0;
      let sy = 0;
      let sw = naturalW;
      let sh = naturalH;

      const panelAspect = panelCols / rows;

      if (slot.cropData) {
        sx = Math.max(0, Math.min(naturalW - 1, Math.floor(slot.cropData.x)));
        sy = Math.max(0, Math.min(naturalH - 1, Math.floor(slot.cropData.y)));
        sw = Math.max(1, Math.min(naturalW - sx, Math.round(slot.cropData.width)));
        sh = Math.max(1, Math.min(naturalH - sy, Math.round(slot.cropData.height)));
      } else {
        // High quality cover fit: conform strictly to panelAspect (arc width / height)
        const imgAspect = naturalW / naturalH;
        if (imgAspect > panelAspect) {
          // Source is wider than panel arc: crop left and right margins symmetrically
          sh = naturalH;
          sw = Math.round(sh * panelAspect);
          sx = Math.max(0, Math.floor((naturalW - sw) / 2));
          sy = 0;
        } else {
          // Source is taller than panel arc: crop top and bottom margins symmetrically
          sw = naturalW;
          sh = Math.round(sw / panelAspect);
          sx = 0;
          sy = Math.max(0, Math.floor((naturalH - sh) / 2));
        }
      }

      // Step-downscale panel to exact pixel grid (panelCols x rows)
      const panelCanvas = this.renderSteppedDownscale(img, sx, sy, sw, sh, panelCols, rows);
      const panelCtx = panelCanvas.getContext('2d', { willReadFrequently: true });
      if (!panelCtx) continue;

      const pImgData = panelCtx.getImageData(0, 0, panelCols, rows);
      const pPixels = pImgData.data;

      // Extract luminance and populate sector
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < panelCols; c++) {
          const pIdx = (r * panelCols + c) * 4;
          const rVal = pPixels[pIdx];
          const gVal = pPixels[pIdx + 1];
          const bVal = pPixels[pIdx + 2];
          const alpha = pPixels[pIdx + 3] / 255;

          // ITU-R BT.709 Luminance
          let lum = (0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal) / 255.0;
          if (alpha < 1) {
            lum = lum * alpha + 1.0 * (1 - alpha);
          }

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
        pCtx.drawImage(panelCanvas, s * pPanelW, 0, pPanelW, pH);
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
    slots: { img: HTMLImageElement; cropData?: ImageCropData | null; label?: string; name?: string }[],
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

      let sx = 0;
      let sy = 0;
      let sw = naturalW;
      let sh = naturalH;

      const panelAspect = panelCols / rows;

      if (slot.cropData) {
        sx = Math.max(0, Math.min(naturalW - 1, Math.floor(slot.cropData.x)));
        sy = Math.max(0, Math.min(naturalH - 1, Math.floor(slot.cropData.y)));
        sw = Math.max(1, Math.min(naturalW - sx, Math.round(slot.cropData.width)));
        sh = Math.max(1, Math.min(naturalH - sy, Math.round(slot.cropData.height)));
      } else {
        const imgAspect = naturalW / naturalH;
        if (imgAspect > panelAspect) {
          sh = naturalH;
          sw = Math.round(sh * panelAspect);
          sx = Math.max(0, Math.floor((naturalW - sw) / 2));
          sy = 0;
        } else {
          sw = naturalW;
          sh = Math.round(sw / panelAspect);
          sx = 0;
          sy = Math.max(0, Math.floor((naturalH - sh) / 2));
        }
      }

      const panelCanvas = this.renderSteppedDownscale(img, sx, sy, sw, sh, panelCols, rows);
      const panelCtx = panelCanvas.getContext('2d', { willReadFrequently: true });
      if (!panelCtx) continue;

      const pImgData = panelCtx.getImageData(0, 0, panelCols, rows);
      const pPixels = pImgData.data;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < panelCols; c++) {
          const pIdx = (r * panelCols + c) * 4;
          const rVal = pPixels[pIdx];
          const gVal = pPixels[pIdx + 1];
          const bVal = pPixels[pIdx + 2];
          const alpha = pPixels[pIdx + 3] / 255;

          let lum = (0.2126 * rVal + 0.7152 * gVal + 0.0722 * bVal) / 255.0;
          if (alpha < 1) {
            lum = lum * alpha + 1.0 * (1 - alpha);
          }

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
        pCtx.drawImage(panelCanvas, s * pPanelW, 0, pPanelW, pH);
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

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) * 4;
        const red = pixels[idx];
        const green = pixels[idx + 1];
        const blue = pixels[idx + 2];
        const alpha = pixels[idx + 3] / 255;

        let lum = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
        if (alpha < 1) {
          lum = lum * alpha + 1.0 * (1 - alpha);
        }

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
