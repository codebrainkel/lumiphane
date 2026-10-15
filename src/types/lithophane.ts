export type LithophaneShape = 'flat' | 'curved' | 'cylinder' | 'cube' | 'nightlight';

export type AppStep = 'mode' | 'upload' | 'preview';

export type SupportType = 'flange' | 'buttress' | 'full' | 'none';

export type PrintOrientation = 'standing' | 'flat';

export type QualityTier = 'master' | 'studio' | 'balanced';

export interface CylinderSlot {
  id: string;
  label: string;
  imageSrc: string;
  name: string;
  cropData: ImageCropData | null;
}

export interface LithophaneSettings {
  // Physical Dimensions (mm)
  width: number;
  height: number;
  cylinderDiameter: number; // mm (diameter of hollow cylinder, 50-300mm, default 90mm)
  cylinderPanelCount?: number; // 1, 2, 3, or 4 images around cylinder (default 4)
  cubeWidth?: number; // mm (side length of square hollow cube, 40-250mm, default 90mm)
  cubePanelCount?: number; // 1, 2, 3, or 4 images around cube (default 4)
  minThickness: number; // e.g. 0.8 mm (thinnest, highlights)
  maxThickness: number; // e.g. 3.0 mm (thickest, shadows)

  // Quality & Resolution Pipeline
  qualityTier: QualityTier; // 'master' (peak photographic fidelity 600+ cols), 'studio' (440 cols), 'balanced' (340 cols)
  sharpness: number; // 0 to 100 (Unsharp mask micro-contrast for maximum edge definition in translucent PLA)
  autoLevels: boolean; // Dynamic range histogram expansion to use full 0.8mm - 3.0mm thickness gamut

  // Shape & Structural Rigidity
  shape: LithophaneShape;
  curveAngle: number; // in degrees for curved arc (e.g. 60° to 120°)
  curveDirection?: 'convex' | 'concave'; // default convex (edges wrap backwards away from viewer)
  hasFrame: boolean;
  frameWidth: number; // mm (e.g. 3.0 mm)
  frameThickness: number; // mm (e.g. 3.2 mm)

  // Print Standing Orientation & Stabilization Supports
  orientation: PrintOrientation; // 'standing' (vertical on Z axis, print-ready) or 'flat'
  supportType: SupportType; // 'flange' (wide base footing), 'buttress', 'full', 'none'
  supportBaseDepth: number; // mm depth at bed contact (e.g. 14.0 mm)
  supportHeight: number; // mm transition height (e.g. 8.0 mm)

  // Image Processing
  brightness: number; // -50 to +50
  contrast: number; // -50 to +50
  gamma: number; // 0.5 to 2.5
  invert: boolean; // default false (dark=thick, bright=thin)
  smoothing: number; // 0 to 2 (slight Gaussian/box filter for smoother 3D surface)

  // Print Setup Defaults
  recommendedLayerHeight: number; // e.g. 0.12 mm
  nozzleDiameter: number; // e.g. 0.4 mm
}

export interface ImageCropData {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatioMode: 'original' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | 'custom';
}

export interface MeshGeometryData {
  vertices: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  indices: Uint32Array;   // [t0a, t0b, t0c, t1a, t1b, t1c, ...]
  normals: Float32Array;  // [nx0, ny0, nz0, ...]
  uvs?: Float32Array;      // [u0, v0, u1, v1, ...]
  thicknesses?: Float32Array; // [th0, th1, ...] local solid thickness in mm
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  gridResolution: {
    cols: number;
    rows: number;
  };
}

export interface MeshValidationResult {
  isValid: boolean;
  isWatertight: boolean;
  isManifold: boolean;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  volumeCm3: number;
  estimatedWeightGrams: number;
  dimensionsMm: {
    width: number;
    height: number;
    depth: number;
  };
  minThicknessDetected: number;
  maxThicknessDetected: number;
  degenerateTriangles: number;
  warnings: string[];
  eulerCharacteristic: number;
}

export interface SamplePresetImage {
  id: string;
  name: string;
  category: string;
  description: string;
  url: string;
}
