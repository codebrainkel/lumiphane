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

      const panelCanvas = this.renderSteppedDownscale(img, sx, sy, sw, sh, blockCols, blockRows);
      const panelCtx = panelCanvas.getContext('2d', { willReadFrequently: true });
      if (!panelCtx) continue;

      const pImgData = panelCtx.getImageData(0, 0, blockCols, blockRows);
      const pPixels = pImgData.data;
      const destC0 = block.col * unitCols;
      const destR0 = block.row * unitRows;

      for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
          const pIdx = (r * blockCols + c) * 4;
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
        pCtx.drawImage(panelCanvas, x, y, Math.max(1, x2 - x), Math.max(1, y2 - y));
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
   * Maps image luminance to fully exploit white PLA's optical dynamic range (0.6mm to 2.25mm)
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
