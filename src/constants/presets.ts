import { LithophaneSettings, SamplePresetImage, QualityTier, CylinderSlot } from '../types/lithophane';

export const DEFAULT_CYLINDER_SLOTS: CylinderSlot[] = [
  {
    id: 'slot_1',
    label: 'Front (0°)',
    name: 'Retriever',
    imageSrc: '/src/assets/images/sample_dog_retriever_1791682818115.jpg',
    cropData: null,
  },
  {
    id: 'slot_2',
    label: 'Right (90°)',
    name: 'Corgi',
    imageSrc: '/src/assets/images/sample_dog_corgi_1791682841012.jpg',
    cropData: null,
  },
  {
    id: 'slot_3',
    label: 'Back (180°)',
    name: 'Cat',
    imageSrc: '/src/assets/images/sample_cat_portrait_1791682858470.jpg',
    cropData: null,
  },
  {
    id: 'slot_4',
    label: 'Left (270°)',
    name: 'Fox',
    imageSrc: '/src/assets/images/animal_fox_portrait_1791682594622.jpg',
    cropData: null,
  },
];

export const DEFAULT_SETTINGS: LithophaneSettings = {
  width: 120, // mm
  height: 90, // mm (auto computed from aspect ratio initially)
  cylinderDiameter: 90, // mm (diameter of hollow cylinder lampshade)
  cylinderPanelCount: 4, // 1 to 4 photos around cylinder (default 4)
  cubeWidth: 90, // mm (width of each face of hollow cube)
  cubePanelCount: 4, // 1 to 4 photos around cube (default 4)
  minThickness: 0.8, // mm (.80mm default highlights)
  maxThickness: 3.0, // mm (3.0mm default shadows)

  // Quality & Resolution Pipeline (Uncompressed Master Quality)
  qualityTier: 'master',
  sharpness: 20, // 20% micro-contrast boost for crisp details in translucent PLA
  autoLevels: true, // Auto dynamic range expansion for maximum tonal gamut

  shape: 'flat',
  curveAngle: 75, // degrees arc for curved lithophane
  curveDirection: 'convex',
  hasFrame: true,
  frameWidth: 3.0, // mm
  frameThickness: 3.2, // mm

  orientation: 'standing', // Print-ready vertical on Z axis
  supportType: 'flange', // Wide stabilizing base footing
  supportBaseDepth: 14.0, // mm
  supportHeight: 8.0, // mm

  brightness: 0,
  contrast: 8,
  gamma: 1.0,
  invert: false,
  smoothing: 0,

  recommendedLayerHeight: 0.12,
  nozzleDiameter: 0.4,
};

/**
 * Calculates optimal lithophane thickness and structural parameters automatically.
 * Baseline at standard size (<= 120mm): .80mm min thickness (highlights) and 3.0mm max thickness (shadows).
 * Auto-scales appropriately when size is scaled up or adjusted to ensure high optical contrast,
 * proper light diffusion, and warp-free bed adhesion during tall vertical 3D printing.
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
      minThickness: 0.80,
      maxThickness: 3.00,
      frameWidth: 3.0,
      frameThickness: 3.2,
      supportBaseDepth: 14.0,
      supportHeight: 8.0,
    };
  }

  // Size is increased from defaults (e.g. 130mm - 280mm):
  const scaleRatio = (maxDim - baseDim) / baseDim; // 0 at 120mm, 0.33 at 160mm, 1.0 at 240mm

  // minThickness gently scales (0.80mm -> 0.92mm max) to maintain stiffness during tall printing
  const minThickness = Math.round((0.80 + Math.min(0.20, scaleRatio * 0.12)) * 100) / 100;

  // maxThickness scales smoothly (3.00mm -> 3.30mm max) to maintain rich deep shadows across broad surface area
  const maxThickness = Math.round((3.00 + Math.min(0.40, scaleRatio * 0.25)) * 100) / 100;

  // Frame width and depth adapt proportionally to structural size
  const frameWidth = Math.round((3.0 + Math.min(2.0, scaleRatio * 1.5)) * 10) / 10;
  const frameThickness = Math.round((maxThickness + 0.2) * 10) / 10;

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
    description: 'Ultra-fine surface resolution for crisp, detailed photo prints.',
    baseCols: 600,
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

/**
 * Computes optimal grid columns for chosen quality tier and physical model width
 */
export function getResolutionForTier(tier: QualityTier = 'master', widthMm: number = 120): number {
  if (tier === 'master') {
    return Math.max(520, Math.min(720, Math.round(widthMm * (600 / 120))));
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
export function getCylinderResolutionForTier(tier: QualityTier = 'master', diameterMm: number = 90): number {
  const circumference = Math.PI * Math.max(40, diameterMm);
  let cols: number;
  if (tier === 'master') {
    cols = Math.round((circumference * 5.0) / 12) * 12;
    return Math.max(1020, Math.min(2160, cols));
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
export function getCubeResolutionForTier(tier: QualityTier = 'master', cubeWidthMm: number = 90): number {
  const perimeter = 4 * Math.max(40, cubeWidthMm);
  let cols: number;
  if (tier === 'master') {
    cols = Math.round((perimeter * 4.2) / 12) * 12;
    return Math.max(960, Math.min(2160, cols));
  }
  if (tier === 'studio') {
    cols = Math.round((perimeter * 3.0) / 12) * 12;
    return Math.max(720, Math.min(1440, cols));
  }
  cols = Math.round((perimeter * 2.0) / 12) * 12;
  return Math.max(480, Math.min(960, cols));
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
 * Returns slot labels based on whether shape is cube or cylinder
 */
export function getMultiPanelSlotLabels(
  shape: string,
  count: number
): { label: string; deg: string; spanDeg: number }[] {
  return shape === 'cube' ? getCubeSlotLabels(count) : getCylinderSlotLabels(count);
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

export function getOptimalMultiPanelWrapRatio(
  shape: string,
  sizeMm: number,
  heightMm: number,
  slotCount: number = 1
): number {
  return shape === 'cube'
    ? getOptimalCubeWrapRatio(sizeMm, heightMm, slotCount)
    : getOptimalCylinderWrapRatio(sizeMm, heightMm, slotCount);
}

export const SAMPLE_IMAGES: SamplePresetImage[] = [
  {
    id: 'golden_retriever',
    name: 'Retriever',
    category: 'Dogs',
    description: 'Sunny portrait with soft fur detail',
    url: '/src/assets/images/sample_dog_retriever_1791682818115.jpg',
  },
  {
    id: 'corgi',
    name: 'Corgi',
    category: 'Dogs',
    description: 'Smiling corgi portrait',
    url: '/src/assets/images/sample_dog_corgi_1791682841012.jpg',
  },
  {
    id: 'cat',
    name: 'Cat',
    category: 'Cats',
    description: 'Fluffy cat with whiskers',
    url: '/src/assets/images/sample_cat_portrait_1791682858470.jpg',
  },
  {
    id: 'fox',
    name: 'Fox',
    category: 'Wildlife',
    description: 'Red fox portrait',
    url: '/src/assets/images/animal_fox_portrait_1791682594622.jpg',
  },
];

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
