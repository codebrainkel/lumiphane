import { LithophaneSettings, QualityTier } from '../types/lithophane';

export const DEFAULT_SETTINGS: LithophaneSettings = {
  width: 120, // mm
  height: 90, // mm (auto computed from aspect ratio initially)
  cylinderDiameter: 90, // mm (diameter of hollow cylinder lampshade)
  cylinderPanelCount: 4, // 1 to 4 photos around cylinder (default 4)
  cubeWidth: 90, // mm (width of each face of hollow cube)
  cubePanelCount: 4, // 1 to 4 photos around cube (default 4)
  minThickness: 0.8, // mm highlights — two 0.4 mm lines, bright but not a pinhole
  maxThickness: 3.0, // mm shadows — deep enough for white PLA without a bulky wall

  // Quality & Resolution Pipeline (Uncompressed Master Quality)
  qualityTier: 'master',
  sharpness: 20, // nozzle-scale edge boost (see ImageProcessor), not sub-nozzle speckle
  autoLevels: true, // Auto dynamic range expansion for maximum tonal gamut

  shape: 'flat',
  stripLayout: 'pair-row',
  curveAngle: 75, // degrees arc for curved lithophane
  curveDirection: 'convex',
  hasFrame: true,
  frameWidth: 5.0, // mm
  frameThickness: 3.6, // mm — darker than the deepest shadow so the border reads as a frame
  borderIcon: 'none',

  orientation: 'standing', // Print-ready vertical on Z axis
  supportType: 'flange', // Footing stays inside the frame, out of the photo
  supportBaseDepth: 10.0, // mm
  supportHeight: 5.0, // mm — matches the frame so the taper ends at the picture

  brightness: 0,
  contrast: 8,
  gamma: 1.0,
  invert: false,
  smoothing: 1, // one light edge-preserving pass before nozzle-scale sharpening

  recommendedLayerHeight: 0.1,
  nozzleDiameter: 0.4,
};

/**
 * Thickness and frame for white PLA on a 0.4 mm nozzle.
 * At a standard size (<= 120 mm): 0.80 mm highlights and 3.00 mm shadows.
 * That span is what white PLA can actually show — thinner than 0.8 mm pinholes,
 * and past ~3.2 mm extra plastic barely blocks more light. The frame is thicker
 * than the darkest shadow. Larger plates gain a little stiffness, not a new look.
 */
export function getAutoScaledThickness(width: number, height: number): {
  minThickness: number;
  maxThickness: number;
  frameWidth: number;
  frameThickness: number;
  supportBaseDepth: number;
  supportHeight: number;
} {
  const maxDim = Math.max(width, height);
  const baseDim = 120;

  if (maxDim <= baseDim) {
    return {
      minThickness: 0.8,
      maxThickness: 3.0,
      frameWidth: 5.0,
      frameThickness: 3.6,
      supportBaseDepth: 10.0,
      supportHeight: 5.0,
    };
  }

  // Size is increased from defaults (e.g. 130mm - 280mm):
  const scaleRatio = (maxDim - baseDim) / baseDim; // 0 at 120mm, 0.33 at 160mm, 1.0 at 240mm

  // minThickness gently scales (0.80mm -> 0.95mm) so a tall sheet stays stiff
  const minThickness = Math.round((0.8 + Math.min(0.2, scaleRatio * 0.15)) * 100) / 100;

  // maxThickness scales smoothly (3.00mm -> 3.30mm) and stays in the useful optical range
  const maxThickness = Math.round((3.0 + Math.min(0.4, scaleRatio * 0.3)) * 100) / 100;

  // Frame width and depth adapt proportionally to structural size
  const frameWidth = Math.round((5.0 + Math.min(2.0, scaleRatio * 1.5)) * 10) / 10;
  const frameThickness = Math.round((maxThickness + 0.6) * 10) / 10;

  // Support footing deepens for taller prints, and stays inside the frame band
  const heightRatio = Math.max(1, height / 90);
  const supportBaseDepth = Math.round(Math.min(18, 10 * Math.pow(heightRatio, 0.6)) * 10) / 10;
  const supportHeight = Math.round(Math.min(10, 5 * Math.pow(heightRatio, 0.5)) * 10) / 10;

  return {
    minThickness,
    maxThickness,
    frameWidth,
    frameThickness,
    supportBaseDepth,
    supportHeight,
  };
}

// Master grid at the 120 mm reference width: 0.24 mm pitch, about 750k triangles for a 120×90 plate.
export const ULTRA_FINE_RESOLUTION = 500;

/**
 * Millimetres between mesh samples for a 0.4 mm nozzle.
 * Master is 0.24 mm — inside the 0.15–0.25 mm band a 0.4 mm nozzle can actually hold.
 */
export const SAMPLE_PITCH_MM: Record<QualityTier, number> = {
  master: 0.24,
  studio: 0.32,
  balanced: 0.4,
};

/** Pitch for a tier. A different nozzle scales the spacing and stays inside a sane band. */
export function samplePitchMm(tier: QualityTier = 'master', nozzleMm = 0.4): number {
  const nozzle = Math.min(1.2, Math.max(0.2, nozzleMm || 0.4));
  const scaled = SAMPLE_PITCH_MM[tier] * (nozzle / 0.4);
  const limits: [number, number] =
    tier === 'master' ? [0.15, 0.25] : tier === 'studio' ? [0.26, 0.4] : [0.34, 0.55];
  return Math.round(Math.min(limits[1], Math.max(limits[0], scaled)) * 1000) / 1000;
}

function colsForLength(lengthMm: number, pitchMm: number, multiple = 1): number {
  const raw = Math.max(pitchMm, lengthMm) / pitchMm;
  if (multiple <= 1) return Math.max(8, Math.round(raw));
  return Math.max(multiple, Math.round(raw / multiple) * multiple);
}

export interface QualityTierInfo {
  id: QualityTier;
  label: string;
  badge: string;
  description: string;
  baseCols: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualityTierInfo> = {
  master: {
    id: 'master',
    label: 'High Detail',
    badge: 'Sharpest',
    description: 'Photo sampling matched to a 0.4 mm nozzle, for crisp prints that still open on a phone.',
    baseCols: 500,
  },
  studio: {
    id: 'studio',
    label: 'Standard',
    badge: 'Recommended',
    description: 'Clean, smooth photo prints with fast processing and smaller file size.',
    baseCols: 375,
  },
  balanced: {
    id: 'balanced',
    label: 'Fast',
    badge: 'Draft',
    description: 'Quickest preview and smallest file size for testing.',
    baseCols: 300,
  },
};

/**
 * Grid columns for a flat or curved plate. Default master pitch is 0.24 mm.
 */
export function getResolutionForTier(
  tier: QualityTier = 'master',
  widthMm: number = 120,
  nozzleMm: number = 0.4
): number {
  const cols = colsForLength(Math.max(10, widthMm), samplePitchMm(tier, nozzleMm));
  if (tier === 'master') return Math.max(320, Math.min(1100, cols));
  if (tier === 'studio') return Math.max(240, Math.min(820, cols));
  return Math.max(160, Math.min(640, cols));
}

/**
 * Computes optimal grid columns for chosen quality tier and cylinder diameter.
 * Guarantees cols is a multiple of 12 (divisible by 1, 2, 3, and 4 panels)
 * and scales to maintain high sampling density around the full 360° perimeter.
 */
export function getCylinderResolutionForTier(
  tier: QualityTier = 'master',
  diameterMm: number = 90,
  nozzleMm: number = 0.4
): number {
  const circumference = Math.PI * Math.max(40, diameterMm);
  const cols = colsForLength(circumference, samplePitchMm(tier, nozzleMm), 12);
  if (tier === 'master') return Math.max(576, Math.min(1680, cols));
  if (tier === 'studio') return Math.max(432, Math.min(1200, cols));
  return Math.max(360, Math.min(960, cols));
}

/**
 * Computes optimal grid columns for chosen quality tier and cube width.
 * Guarantees cols is a multiple of 12 (divisible by 1, 2, 3, and 4 panels)
 * and scales to maintain high sampling density around the 4 sides of the hollow cube.
 */
export function getCubeResolutionForTier(
  tier: QualityTier = 'master',
  cubeWidthMm: number = 90,
  nozzleMm: number = 0.4
): number {
  const perimeter = 4 * Math.max(40, cubeWidthMm);
  const cols = colsForLength(perimeter, samplePitchMm(tier, nozzleMm), 12);
  if (tier === 'master') return Math.max(576, Math.min(1920, cols));
  if (tier === 'studio') return Math.max(432, Math.min(1440, cols));
  return Math.max(360, Math.min(1080, cols));
}

/**
 * Returns user-facing label and angular range for each slot given a total count (1 to 4).
 */
export function getCylinderSlotLabels(count: number): { label: string; deg: string; spanDeg: number }[] {
  const clamped = Math.max(1, Math.min(4, count));
  if (clamped === 1) {
    return [{ label: 'Full 360° Wrap', deg: '0°–360°', spanDeg: 360 }];
  }
  if (clamped === 2) {
    return [
      { label: 'Front', deg: '0°–180°', spanDeg: 180 },
      { label: 'Back', deg: '180°–360°', spanDeg: 180 },
    ];
  }
  if (clamped === 3) {
    return [
      { label: 'Front', deg: '0°–120°', spanDeg: 120 },
      { label: 'Right', deg: '120°–240°', spanDeg: 120 },
      { label: 'Left', deg: '240°–360°', spanDeg: 120 },
    ];
  }
  return [
    { label: 'Front', deg: '0°–90°', spanDeg: 90 },
    { label: 'Right', deg: '90°–180°', spanDeg: 90 },
    { label: 'Back', deg: '180°–270°', spanDeg: 90 },
    { label: 'Left', deg: '270°–360°', spanDeg: 90 },
  ];
}

/**
 * Returns user-facing label and face name for hollow cube slots given a count (1 to 4).
 */
export function getCubeSlotLabels(count: number): { label: string; deg: string; spanDeg: number }[] {
  const clamped = Math.max(1, Math.min(4, count));
  if (clamped === 1) {
    return [{ label: 'Full 4-Face Wrap', deg: 'All 4 Sides', spanDeg: 360 }];
  }
  if (clamped === 2) {
    return [
      { label: 'Front & Right', deg: 'Faces 1–2', spanDeg: 180 },
      { label: 'Back & Left', deg: 'Faces 3–4', spanDeg: 180 },
    ];
  }
  if (clamped === 3) {
    return [
      { label: 'Panel 1', deg: 'Front / Right', spanDeg: 120 },
      { label: 'Panel 2', deg: 'Right / Back', spanDeg: 120 },
      { label: 'Panel 3', deg: 'Back / Left', spanDeg: 120 },
    ];
  }
  return [
    { label: 'Front Face', deg: '0°', spanDeg: 90 },
    { label: 'Right Face', deg: '90°', spanDeg: 90 },
    { label: 'Back Face', deg: '180°', spanDeg: 90 },
    { label: 'Left Face', deg: '270°', spanDeg: 90 },
  ];
}

export interface StripLayoutCell {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  label: string;
}

export interface StripLayoutPreset {
  id: string;
  label: string;
  count: 1 | 2 | 3 | 4;
  gridCols: number;
  gridRows: number;
  cells: StripLayoutCell[];
}

const cell = (
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  label: string
): StripLayoutCell => ({ col, row, colSpan, rowSpan, label });

/**
 * Collage presets for a flat or curved panel.
 * Cells are listed in reading order so photo 1 is the first block.
 */
export const STRIP_LAYOUTS: StripLayoutPreset[] = [
  {
    id: 'single',
    label: 'Full panel',
    count: 1,
    gridCols: 1,
    gridRows: 1,
    cells: [cell(0, 0, 1, 1, 'Full panel')],
  },
  {
    id: 'pair-row',
    label: 'Side by side',
    count: 2,
    gridCols: 2,
    gridRows: 1,
    cells: [cell(0, 0, 1, 1, 'Left'), cell(1, 0, 1, 1, 'Right')],
  },
  {
    id: 'pair-stack',
    label: 'Stacked',
    count: 2,
    gridCols: 1,
    gridRows: 2,
    cells: [cell(0, 0, 1, 1, 'Top'), cell(0, 1, 1, 1, 'Bottom')],
  },
  {
    id: 'trio-row',
    label: '3 wide',
    count: 3,
    gridCols: 3,
    gridRows: 1,
    cells: [
      cell(0, 0, 1, 1, 'Left'),
      cell(1, 0, 1, 1, 'Center'),
      cell(2, 0, 1, 1, 'Right'),
    ],
  },
  {
    id: 'trio-stack',
    label: 'Stacked',
    count: 3,
    gridCols: 1,
    gridRows: 3,
    cells: [
      cell(0, 0, 1, 1, 'Top'),
      cell(0, 1, 1, 1, 'Middle'),
      cell(0, 2, 1, 1, 'Bottom'),
    ],
  },
  {
    id: 'trio-two-over-one',
    label: '2 wide, 1 under',
    count: 3,
    gridCols: 2,
    gridRows: 2,
    cells: [
      cell(0, 0, 1, 1, 'Top left'),
      cell(1, 0, 1, 1, 'Top right'),
      cell(0, 1, 2, 1, 'Bottom'),
    ],
  },
  {
    id: 'trio-one-over-two',
    label: '1 top, 2 under',
    count: 3,
    gridCols: 2,
    gridRows: 2,
    cells: [
      cell(0, 0, 2, 1, 'Top'),
      cell(0, 1, 1, 1, 'Bottom left'),
      cell(1, 1, 1, 1, 'Bottom right'),
    ],
  },
  {
    id: 'trio-left',
    label: 'Tall left',
    count: 3,
    gridCols: 3,
    gridRows: 2,
    cells: [
      cell(0, 0, 2, 2, 'Left'),
      cell(2, 0, 1, 1, 'Top right'),
      cell(2, 1, 1, 1, 'Bottom right'),
    ],
  },
  {
    id: 'trio-right',
    label: 'Tall right',
    count: 3,
    gridCols: 3,
    gridRows: 2,
    cells: [
      cell(0, 0, 1, 1, 'Top left'),
      cell(0, 1, 1, 1, 'Bottom left'),
      cell(1, 0, 2, 2, 'Right'),
    ],
  },
  {
    id: 'quad-grid',
    label: '2×2',
    count: 4,
    gridCols: 2,
    gridRows: 2,
    cells: [
      cell(0, 0, 1, 1, 'Top left'),
      cell(1, 0, 1, 1, 'Top right'),
      cell(0, 1, 1, 1, 'Bottom left'),
      cell(1, 1, 1, 1, 'Bottom right'),
    ],
  },
  {
    id: 'quad-row',
    label: '4 wide',
    count: 4,
    gridCols: 4,
    gridRows: 1,
    cells: [
      cell(0, 0, 1, 1, 'Left'),
      cell(1, 0, 1, 1, 'Center left'),
      cell(2, 0, 1, 1, 'Center right'),
      cell(3, 0, 1, 1, 'Right'),
    ],
  },
  {
    id: 'quad-left',
    label: 'Tall left',
    count: 4,
    gridCols: 3,
    gridRows: 3,
    cells: [
      cell(0, 0, 2, 3, 'Left'),
      cell(2, 0, 1, 1, 'Top right'),
      cell(2, 1, 1, 1, 'Middle right'),
      cell(2, 2, 1, 1, 'Bottom right'),
    ],
  },
  {
    id: 'quad-right',
    label: 'Tall right',
    count: 4,
    gridCols: 3,
    gridRows: 3,
    cells: [
      cell(0, 0, 1, 1, 'Top left'),
      cell(0, 1, 1, 1, 'Middle left'),
      cell(0, 2, 1, 1, 'Bottom left'),
      cell(1, 0, 2, 3, 'Right'),
    ],
  },
];

const DEFAULT_STRIP_LAYOUT: Record<number, string> = {
  1: 'single',
  2: 'pair-row',
  3: 'trio-row',
  4: 'quad-grid',
};

export function getStripLayoutsForCount(count: number): StripLayoutPreset[] {
  const n = Math.max(1, Math.min(4, count)) as 1 | 2 | 3 | 4;
  return STRIP_LAYOUTS.filter((layout) => layout.count === n);
}

/** Picks the saved collage when it matches the photo count, otherwise the default for that count. */
export function resolveStripLayout(layoutId: string | undefined, count: number): StripLayoutPreset {
  const n = Math.max(1, Math.min(4, count)) as 1 | 2 | 3 | 4;
  const match = STRIP_LAYOUTS.find((layout) => layout.id === layoutId && layout.count === n);
  if (match) return match;
  const fallbackId = DEFAULT_STRIP_LAYOUT[n];
  return STRIP_LAYOUTS.find((layout) => layout.id === fallbackId) ?? STRIP_LAYOUTS[0];
}

/**
 * Grid size for a flat or curved collage. Defaults match the previous fixed tiling.
 */
export function getStripTileLayout(
  count: number,
  layoutId?: string
): { tileCols: number; tileRows: number } {
  const layout = resolveStripLayout(layoutId, count);
  return { tileCols: layout.gridCols, tileRows: layout.gridRows };
}

/**
 * Labels for photos tiled across a flat panel or curved arc.
 */
export function getStripSlotLabels(
  count: number,
  layoutId?: string
): { label: string; deg: string; spanDeg: number }[] {
  const layout = resolveStripLayout(layoutId, count);
  return layout.cells.map((item) => ({
    label: item.label,
    deg: '',
    spanDeg: 0,
  }));
}

/**
 * Returns slot labels for the active shape.
 * Enclosed lamps wrap around the perimeter. Flat and curved panels tile across the face.
 */
export function getMultiPanelSlotLabels(
  shape: string,
  count: number,
  layoutId?: string
): { label: string; deg: string; spanDeg: number }[] {
  if (shape === 'cube') return getCubeSlotLabels(count);
  if (shape === 'cylinder') return getCylinderSlotLabels(count);
  return getStripSlotLabels(count, layoutId);
}

/**
 * Calculates optimal aspect ratio (width / height) for a single cylinder slot/panel.
 * For 1 photo wrap: (π * D) / H (e.g. ~2.98:1 for 90mm diameter and 95mm height).
 */
export function getOptimalCylinderWrapRatio(
  diameterMm: number,
  heightMm: number,
  slotCount: number = 1
): number {
  const count = Math.max(1, Math.min(4, slotCount));
  const circ = Math.PI * Math.max(30, diameterMm);
  const arcWidthMm = circ / count;
  const h = Math.max(20, heightMm);
  return Math.round((arcWidthMm / h) * 100) / 100;
}

/**
 * Calculates optimal aspect ratio (width / height) for a single hollow cube slot/panel.
 * For 4 photos on 90x90 cube: 90 / 90 = 1.0 (Square).
 * For 1 photo wrap: (4 * W) / H (e.g. 360 / 90 = 4.0:1).
 */
export function getOptimalCubeWrapRatio(
  cubeWidthMm: number,
  heightMm: number,
  slotCount: number = 1
): number {
  const count = Math.max(1, Math.min(4, slotCount));
  const perimeter = 4 * Math.max(30, cubeWidthMm);
  const panelWidthMm = perimeter / count;
  const h = Math.max(20, heightMm);
  return Math.round((panelWidthMm / h) * 100) / 100;
}

/**
 * Aspect ratio (width / height) of one tile on a flat or curved panel.
 */
export function getOptimalStripWrapRatio(
  widthMm: number,
  heightMm: number,
  slotCount: number = 1,
  layoutId?: string
): number {
  const { tileCols, tileRows } = getStripTileLayout(slotCount, layoutId);
  const cellW = Math.max(10, widthMm) / tileCols;
  const cellH = Math.max(10, heightMm) / tileRows;
  return Math.round((cellW / cellH) * 100) / 100;
}

/** Width/height of one photo's block inside the current collage. */
export function getStripCellAspect(
  widthMm: number,
  heightMm: number,
  slotCount: number,
  layoutId: string | undefined,
  index: number
): number {
  const layout = resolveStripLayout(layoutId, slotCount);
  const item = layout.cells[Math.max(0, Math.min(layout.cells.length - 1, index))] ?? layout.cells[0];
  const cellW = (Math.max(10, widthMm) * item.colSpan) / layout.gridCols;
  const cellH = (Math.max(10, heightMm) * item.rowSpan) / layout.gridRows;
  return Math.round((cellW / Math.max(1, cellH)) * 100) / 100;
}

/** Physical width of one photo's block, in millimetres. */
export function getStripCellWidthMm(
  widthMm: number,
  slotCount: number,
  layoutId: string | undefined,
  index: number
): number {
  const layout = resolveStripLayout(layoutId, slotCount);
  const item = layout.cells[Math.max(0, Math.min(layout.cells.length - 1, index))] ?? layout.cells[0];
  return (Math.max(10, widthMm) * item.colSpan) / layout.gridCols;
}

/**
 * Panel height that lets a single grid cell keep the photo's aspect ratio.
 * Wider or taller blocks in the same collage are cover-cropped to fit.
 */
export function getStripHeightForPhotos(
  widthMm: number,
  photoAspect: number,
  slotCount: number,
  layoutId?: string
): number {
  const { tileCols, tileRows } = getStripTileLayout(slotCount, layoutId);
  const aspect = Math.max(0.2, photoAspect);
  const height = ((Math.max(10, widthMm) / tileCols) * tileRows) / aspect;
  return Math.max(10, Math.min(260, Math.round(height)));
}

export function getOptimalMultiPanelWrapRatio(
  shape: string,
  sizeMm: number,
  heightMm: number,
  slotCount: number = 1
): number {
  if (shape === 'cube') return getOptimalCubeWrapRatio(sizeMm, heightMm, slotCount);
  if (shape === 'cylinder') return getOptimalCylinderWrapRatio(sizeMm, heightMm, slotCount);
  return getOptimalStripWrapRatio(sizeMm, heightMm, slotCount);
}

/** Aspect ratio of the frame one photo is fitted into. */
export function getSlotFrameAspect(
  shape: string,
  widthMm: number,
  heightMm: number,
  slotCount: number,
  layoutId: string | undefined,
  index: number,
  cylinderDiameterMm = 90,
  cubeWidthMm = 90
): number {
  if (shape === 'cube') return getOptimalCubeWrapRatio(cubeWidthMm, heightMm, slotCount);
  if (shape === 'cylinder') return getOptimalCylinderWrapRatio(cylinderDiameterMm, heightMm, slotCount);
  return getStripCellAspect(widthMm, heightMm, slotCount, layoutId, index);
}

export const SLICER_PRESETS = [
  {
    name: 'Bambu Studio / OrcaSlicer',
    icon: 'Printer',
    notes: 'Open the .3mf in Bambu Studio. It is already standing, with 0.10 mm layers, 10 walls, 100% concentric infill, a 6 mm brim, and supports off.',
  },
  {
    name: 'PrusaSlicer',
    icon: 'Gauge',
    notes: 'Use 10 perimeters and 100% concentric infill so the wall is solid. 0.10 mm layers, 6 mm brim, supports off, outer wall about 30 mm/s.',
  },
  {
    name: 'UltiMaker Cura',
    icon: 'Layers',
    notes: '10 walls, 100% concentric infill, outer wall 30 mm/s, 6 mm brim, supports off. Print the model standing upright.',
  },
];
