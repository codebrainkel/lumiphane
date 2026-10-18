import { LithophaneSettings, QualityTier } from '../types/lithophane';

export const DEFAULT_SETTINGS: LithophaneSettings = {
  width: 120, // mm
  height: 90, // mm (auto computed from aspect ratio initially)
  cylinderDiameter: 90, // mm (diameter of hollow cylinder lampshade)
  cylinderPanelCount: 4, // 1 to 4 photos around cylinder (default 4)
  cubeWidth: 90, // mm (width of each face of hollow cube)
  cubePanelCount: 4, // 1 to 4 photos around cube (default 4)
  hexagonDiameter: 90, // mm (corner-to-corner diameter of hollow hexagon lantern, 45mm per side)
  hexagonPanelCount: 6, // 1 to 6 photos around hexagon (default 6)
  minThickness: 0.8, // mm highlights — thin enough to pass light, thick enough for two perimeters
  maxThickness: 3.0, // mm shadows — Beer–Lambert range with k = 1.75/mm white PLA

  // Quality & Resolution Pipeline (Uncompressed Master Quality)
  qualityTier: 'master',
  sharpness: 20, // 20% micro-contrast boost for crisp details in translucent PLA
  autoLevels: true, // Auto dynamic range expansion for maximum tonal gamut

  shape: 'flat',
  stripLayout: 'pair-row',
  curveAngle: 75, // degrees arc for curved lithophane
  curveDirection: 'convex',
  hasFrame: true,
  frameWidth: 5.0, // mm
  frameThickness: 3.4, // mm (maxThickness + 0.4, so the border reads darker than any shadow)
  borderIcon: 'none',

  orientation: 'standing', // Print-ready vertical on Z axis
  supportType: 'flange', // Wide stabilizing base footing
  supportBaseDepth: 14.0, // mm
  supportHeight: 8.0, // mm

  brightness: 0,
  contrast: 0,
  gamma: 1.0,
  invert: false,
  smoothing: 0,

  recommendedLayerHeight: 0.12,
  nozzleDiameter: 0.4,
};

/**
 * Calculates optimal lithophane thickness and structural parameters automatically.
 * Baseline at standard size (<= 120mm): 0.80mm highlights and 3.00mm shadows.
 * Larger panels keep the same proportional growth the previous 0.60–2.25mm curve
 * had, scaled onto the new baseline (min × 0.80/0.60, max × 3.00/2.25).
 * The frame is always 0.4mm thicker than the darkest shadow.
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
    const minThickness = 0.8;
    const maxThickness = 3.0;
    return {
      minThickness,
      maxThickness,
      frameWidth: 5.0,
      frameThickness: Math.round((maxThickness + 0.4) * 100) / 100,
      supportBaseDepth: 14.0,
      supportHeight: 8.0,
    };
  }

  // Size is increased from defaults (e.g. 130mm - 280mm):
  const scaleRatio = (maxDim - baseDim) / baseDim; // 0 at 120mm, 0.33 at 160mm, 1.0 at 240mm

  // Same shape as the old 0.60 + min(0.15, ratio·0.09) curve, scaled by 0.80/0.60.
  const minThickness = Math.round((0.8 + Math.min(0.2, scaleRatio * 0.12)) * 100) / 100;

  // Same shape as the old 2.25 + min(0.30, ratio·0.1875) curve, scaled by 3.00/2.25.
  const maxThickness = Math.round((3.0 + Math.min(0.4, scaleRatio * 0.25)) * 100) / 100;

  // Frame width adapts to structural size. Depth stays 0.4mm past the darkest shadow.
  const frameWidth = Math.round((5.0 + Math.min(2.0, scaleRatio * 1.5)) * 10) / 10;
  const frameThickness = Math.round((maxThickness + 0.4) * 100) / 100;

  // Support footing deepens for taller prints to ensure 100% bed adhesion stability
  const heightRatio = Math.max(1, height / 90);
  const supportBaseDepth = Math.round(Math.min(24, 14 * Math.pow(heightRatio, 0.6)) * 10) / 10;
  const supportHeight = Math.round(Math.min(14, 8 * Math.pow(heightRatio, 0.5)) * 10) / 10;

  return {
    minThickness,
    maxThickness,
    frameWidth,
    frameThickness,
    supportBaseDepth,
    supportHeight,
  };
}

// Permanent ultra fine mesh resolution (440 points wide, ~380k triangles) for high-precision 3D files
export const ULTRA_FINE_RESOLUTION = 440;

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
    description: 'One relief sample every 0.10 mm, finer than a 0.12 mm print layer.',
    baseCols: 1200,
  },
  studio: {
    id: 'studio',
    label: 'Standard',
    badge: 'Recommended',
    description: 'Clean, smooth photo prints with fast processing and smaller file size.',
    baseCols: 440,
  },
  balanced: {
    id: 'balanced',
    label: 'Fast',
    badge: 'Draft',
    description: 'Quickest preview and smallest file size for testing.',
    baseCols: 340,
  },
};

/** Printed relief sample spacing. Finer than the 0.12 mm layer the print guide recommends. */
export const MASTER_PITCH_MM = 0.1;

/**
 * Photo samples kept in one mesh. A 120×90 mm panel at 0.10 mm is about 1.1 million
 * and stays under this. Larger parts ease the pitch back just enough to fit.
 */
export const MAX_RELIEF_SAMPLES = 1_800_000;

function columnsForPitch(
  spanMm: number,
  heightMm: number | undefined,
  pitchMm: number,
  multiple: number,
  minCols: number,
): number {
  const span = Math.max(pitchMm, spanMm);
  let cols = Math.max(minCols, Math.round(span / pitchMm / multiple) * multiple);
  if (heightMm == null || !(heightMm > 0)) return cols;
  const height = Math.max(pitchMm, heightMm);
  while (cols > minCols) {
    const rows = Math.max(4, Math.round((cols * height) / span));
    if (cols * rows <= MAX_RELIEF_SAMPLES) break;
    cols -= multiple;
  }
  return cols;
}

/**
 * Grid columns for the chosen quality tier and physical model width.
 * Master uses a fixed 0.10 mm pitch. Pass height so a very large panel
 * stays inside the sample budget.
 */
export function getResolutionForTier(
  tier: QualityTier = 'master',
  widthMm: number = 120,
  heightMm?: number,
): number {
  if (tier === 'master') {
    return columnsForPitch(widthMm, heightMm, MASTER_PITCH_MM, 1, 520);
  }
  if (tier === 'studio') {
    return Math.max(380, Math.min(540, Math.round(widthMm * (440 / 120))));
  }
  return Math.max(280, Math.min(420, Math.round(widthMm * (340 / 120))));
}

/**
 * Computes optimal grid columns for chosen quality tier and cylinder diameter.
 * Guarantees cols is a multiple of 12 (divisible by 1, 2, 3, and 4 panels)
 * and scales to maintain high sampling density around the full 360° perimeter.
 */
export function getCylinderResolutionForTier(
  tier: QualityTier = 'master',
  diameterMm: number = 90,
  heightMm?: number,
): number {
  const circumference = Math.PI * Math.max(40, diameterMm);
  let cols: number;
  if (tier === 'master') {
    return columnsForPitch(circumference, heightMm, MASTER_PITCH_MM, 12, 1020);
  }
  if (tier === 'studio') {
    cols = Math.round((circumference * 3.4) / 12) * 12;
    return Math.max(768, Math.min(1440, cols));
  }
  cols = Math.round((circumference * 2.3) / 12) * 12;
  return Math.max(516, Math.min(960, cols));
}

/**
 * Computes optimal grid columns for chosen quality tier and cube width.
 * Guarantees cols is a multiple of 12 (divisible by 1, 2, 3, and 4 panels)
 * and scales to maintain high sampling density around the 4 sides of the hollow cube.
 */
export function getCubeResolutionForTier(
  tier: QualityTier = 'master',
  cubeWidthMm: number = 90,
  heightMm?: number,
): number {
  const perimeter = 4 * Math.max(40, cubeWidthMm);
  let cols: number;
  if (tier === 'master') {
    return columnsForPitch(perimeter, heightMm, MASTER_PITCH_MM, 12, 960);
  }
  if (tier === 'studio') {
    cols = Math.round((perimeter * 3.0) / 12) * 12;
    return Math.max(720, Math.min(1440, cols));
  }
  cols = Math.round((perimeter * 2.0) / 12) * 12;
  return Math.max(480, Math.min(960, cols));
}

/**
 * Computes optimal grid columns for chosen quality tier and hexagon diameter.
 * Guarantees cols is a multiple of 60 (divisible by 6 hexagon faces as well as 1, 2, 3, 4, 5, and 6 panels)
 * and scales to maintain high sampling density around the 6 sides of the hollow hexagon.
 */
export function getHexagonResolutionForTier(
  tier: QualityTier = 'master',
  diameterMm: number = 90,
  heightMm?: number,
): number {
  const perimeter = 3 * Math.max(40, diameterMm);
  let cols: number;
  if (tier === 'master') {
    return columnsForPitch(perimeter, heightMm, MASTER_PITCH_MM, 60, 960);
  }
  if (tier === 'studio') {
    cols = Math.round((perimeter * 3.3) / 60) * 60;
    return Math.max(720, Math.min(1440, cols));
  }
  cols = Math.round((perimeter * 2.2) / 60) * 60;
  return Math.max(480, Math.min(960, cols));
}

/**
 * Maximum number of photos supported by the given shape.
 */
export function getMaxPhotosForShape(shape: string): number {
  return shape === 'hexagon' ? 6 : 4;
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

/**
 * Returns user-facing label and face range for 6-sided hollow hexagon slots given a count (1 to 6).
 */
export function getHexagonSlotLabels(count: number): { label: string; deg: string; spanDeg: number }[] {
  const clamped = Math.max(1, Math.min(6, count));
  if (clamped === 1) {
    return [{ label: 'Full 6-Face Wrap', deg: 'All 6 Sides', spanDeg: 360 }];
  }
  if (clamped === 2) {
    return [
      { label: 'Front 3 Faces', deg: 'Faces 1–3', spanDeg: 180 },
      { label: 'Back 3 Faces', deg: 'Faces 4–6', spanDeg: 180 },
    ];
  }
  if (clamped === 3) {
    return [
      { label: 'Front Pair', deg: 'Faces 1–2', spanDeg: 120 },
      { label: 'Right Pair', deg: 'Faces 3–4', spanDeg: 120 },
      { label: 'Left Pair', deg: 'Faces 5–6', spanDeg: 120 },
    ];
  }
  if (clamped === 4) {
    return [
      { label: 'Front', deg: '0°–90°', spanDeg: 90 },
      { label: 'Right', deg: '90°–180°', spanDeg: 90 },
      { label: 'Back', deg: '180°–270°', spanDeg: 90 },
      { label: 'Left', deg: '270°–360°', spanDeg: 90 },
    ];
  }
  if (clamped === 5) {
    return [
      { label: 'Panel 1', deg: '0°–72°', spanDeg: 72 },
      { label: 'Panel 2', deg: '72°–144°', spanDeg: 72 },
      { label: 'Panel 3', deg: '144°–216°', spanDeg: 72 },
      { label: 'Panel 4', deg: '216°–288°', spanDeg: 72 },
      { label: 'Panel 5', deg: '288°–360°', spanDeg: 72 },
    ];
  }
  return [
    { label: 'Front Face', deg: 'Face 1 · 0°', spanDeg: 60 },
    { label: 'Front-Right Face', deg: 'Face 2 · 60°', spanDeg: 60 },
    { label: 'Back-Right Face', deg: 'Face 3 · 120°', spanDeg: 60 },
    { label: 'Back Face', deg: 'Face 4 · 180°', spanDeg: 60 },
    { label: 'Back-Left Face', deg: 'Face 5 · 240°', spanDeg: 60 },
    { label: 'Front-Left Face', deg: 'Face 6 · 300°', spanDeg: 60 },
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
  if (shape === 'hexagon') return getHexagonSlotLabels(count);
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
 * Calculates optimal aspect ratio (width / height) for a single 6-sided hexagon slot/panel.
 * Regular hexagon perimeter is 3 * diameter (6 sides of length diameter / 2).
 */
export function getOptimalHexagonWrapRatio(
  hexagonDiameterMm: number,
  heightMm: number,
  slotCount: number = 1
): number {
  const count = Math.max(1, Math.min(6, slotCount));
  const perimeter = 3 * Math.max(30, hexagonDiameterMm);
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
  if (shape === 'hexagon') return getOptimalHexagonWrapRatio(sizeMm, heightMm, slotCount);
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
  cubeWidthMm = 90,
  hexagonDiameterMm = 90
): number {
  if (shape === 'cube') return getOptimalCubeWrapRatio(cubeWidthMm, heightMm, slotCount);
  if (shape === 'hexagon') return getOptimalHexagonWrapRatio(hexagonDiameterMm, heightMm, slotCount);
  if (shape === 'cylinder') return getOptimalCylinderWrapRatio(cylinderDiameterMm, heightMm, slotCount);
  return getStripCellAspect(widthMm, heightMm, slotCount, layoutId, index);
}

export const SLICER_PRESETS = [
  {
    name: 'Bambu Studio / OrcaSlicer',
    icon: 'Printer',
    notes: 'Open the .3mf file directly in Bambu Studio. 100% solid infill, 0.12mm layers, and brim settings are pre-configured.',
  },
  {
    name: 'PrusaSlicer',
    icon: 'Gauge',
    notes: 'Set perimeters to 99 for a solid print. Use 0.10–0.12mm layer height and add a 5mm outer brim for stability.',
  },
  {
    name: 'UltiMaker Cura',
    icon: 'Layers',
    notes: 'Set infill to 100% and outer wall speed to 30–35 mm/s. Align the model along your print bed Y-axis.',
  },
];
