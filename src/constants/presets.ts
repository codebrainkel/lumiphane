import { LithophaneSettings, SamplePresetImage, QualityTier } from '../types/lithophane';

export const DEFAULT_SETTINGS: LithophaneSettings = {
  width: 120, // mm
  height: 90, // mm (auto computed from aspect ratio initially)
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
    label: 'Master Quality',
    badge: 'Ultra-HD (600 pts)',
    description: 'Pinnacle photographic fidelity (~0.18-0.20mm physical detail pitch, ~500k-650k triangles)',
    baseCols: 600,
  },
  studio: {
    id: 'studio',
    label: 'Studio Quality',
    badge: 'High-Res (440 pts)',
    description: 'Crisp balance for standard FDM printing (~0.25mm detail pitch, ~380k triangles)',
    baseCols: 440,
  },
  balanced: {
    id: 'balanced',
    label: 'Fast Preview',
    badge: 'Draft (340 pts)',
    description: 'Rapid slicing and prototyping (~0.35mm detail pitch, ~230k triangles)',
    baseCols: 340,
  },
};

/**
 * Computes optimal grid columns for chosen quality tier and physical model width
 */
export function getResolutionForTier(tier: QualityTier = 'master', widthMm: number = 120): number {
  if (tier === 'master') {
    // 5.0 samples per mm (600 cols at 120mm), clamped between 520 and 720
    return Math.max(520, Math.min(720, Math.round(widthMm * (600 / 120))));
  }
  if (tier === 'studio') {
    // ~3.67 samples per mm (440 cols at 120mm), clamped between 380 and 540
    return Math.max(380, Math.min(540, Math.round(widthMm * (440 / 120))));
  }
  // draft/balanced:
  return Math.max(280, Math.min(420, Math.round(widthMm * (340 / 120))));
}

export const SAMPLE_IMAGES: SamplePresetImage[] = [
  {
    id: 'golden_retriever',
    name: 'Retriever',
    category: 'Dogs',
    description: 'Bright sunny portrait of a cheerful golden retriever with rich fur detail (4:3 Landscape)',
    url: '/src/assets/images/sample_dog_retriever_1791682818115.jpg',
  },
  {
    id: 'wildlife',
    name: 'Wildlife',
    category: 'Nature',
    description: 'Square 1:1 format wildlife scene with intricate texture and depth (1:1 Square)',
    url: '/src/assets/images/sample_wildlife_1791573399712.jpg',
  },
  {
    id: 'corgi',
    name: 'Corgi',
    category: 'Dogs',
    description: 'Luminous daylight portrait of a happy smiling Welsh corgi with alert ears',
    url: '/src/assets/images/sample_dog_corgi_1791682841012.jpg',
  },
  {
    id: 'cat',
    name: 'Cat',
    category: 'Cats',
    description: 'High-key sunlit portrait of a fluffy cat with vibrant green eyes and whiskers',
    url: '/src/assets/images/sample_cat_portrait_1791682858470.jpg',
  },
];

export const SLICER_PRESETS = [
  {
    name: 'Bambu Studio / OrcaSlicer',
    icon: 'Printer',
    notes: 'Print vertically on the Y-axis. Infill: 100% rectilinear. Layer height: 0.12mm (0.08mm high detail). Brim: 5-8mm outer brim. When opening via File → Open or double-click, simply click "OK" on the "load geometry data only" prompt to use your active printer settings, or use File → Import → 3D Model.',
  },
  {
    name: 'PrusaSlicer',
    icon: 'Gauge',
    notes: 'Perimeters: 99 (solid plastic for uniform light transmission). Layer height: 0.10mm - 0.15mm. Cooling fan: 100% after layer 2. Seam position: Rear.',
  },
  {
    name: 'UltiMaker Cura',
    icon: 'Layers',
    notes: 'Infill Density: 100%. Print Speed: 30-40 mm/s for outer wall. Wall Line Count: 99. Orientation: Align long edge with Y-axis.',
  },
];
