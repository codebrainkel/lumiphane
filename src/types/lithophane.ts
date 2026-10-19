export type LithophaneShape = 'flat' | 'curved' | 'cylinder' | 'cube' | 'hexagon' | 'nightlight';

export type AppStep = 'mode' | 'upload' | 'preview';

export type SupportType = 'flange' | 'buttress' | 'full' | 'none';

export type PrintOrientation = 'standing' | 'flat';

export type QualityTier = 'master' | 'studio' | 'balanced';

export type BorderIcon = 'none' | 'heart' | 'bone' | 'star';

export type ReliefSide = 'outside' | 'inside';

export interface CylinderSlot {
  id: string;
  label: string;
  imageSrc: string;
  name: string;
  cropData: ImageCropData | null;
  // Slides the photo inside its frame. 0 keeps the crop, or the centered cover.
  // Positive X moves the photo right. Positive Y moves the photo up. Range is -1 to 1.
  offsetX?: number;
  offsetY?: number;
}

export interface LithophaneSettings {
  // Physical Dimensions (mm)
  width: number;
  height: number;
  cylinderDiameter: number; // mm (diameter of hollow cylinder, 50-300mm, default 90mm)
  cylinderPanelCount?: number; // 1, 2, 3, or 4 images around cylinder (default 4)
  cubeWidth?: number; // mm (side length of square hollow cube, 40-250mm, default 90mm)
  cubePanelCount?: number; // 1, 2, 3, or 4 images around cube (default 4)
  hexagonDiameter?: number; // mm (corner-to-corner diameter of 6-sided hollow hexagon, 50-260mm, default 90mm)
  hexagonPanelCount?: number; // 1 to 6 images around hexagon (default 6)
  minThickness: number; // e.g. 0.8 mm (thinnest, highlights)
  maxThickness: number; // e.g. 3.0 mm (thickest, shadows)

  // Quality & Resolution Pipeline
  qualityTier: QualityTier; // 'master' (peak photographic fidelity 600+ cols), 'studio' (440 cols), 'balanced' (340 cols)
  sharpness: number; // 0 to 100 (Unsharp mask micro-contrast for maximum edge definition in translucent PLA)
  autoLevels: boolean; // Dynamic range histogram expansion to use the full thickness gamut

  // Shape & Structural Rigidity
  shape: LithophaneShape;
  // Preset collage for flat and curved panels when 2–4 photos are used.
  stripLayout?: string;
  curveAngle: number; // in degrees for curved arc (e.g. 60° to 120°)
  curveDirection?: 'convex' | 'concave'; // default convex (edges wrap backwards away from viewer)
  hasFrame: boolean;
  frameWidth: number; // mm (e.g. 3.0 mm)
  frameThickness: number; // mm (e.g. 3.4 mm, 0.4 mm thicker than the darkest shadow)
  borderIcon: BorderIcon; // one motif repeated along the middle of the border

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
  reliefSide?: ReliefSide; // default 'inside' (smooth exterior, sculpted interior; 'outside' = sculpted exterior, smooth interior)
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
  thicknesses?: Float32Array; // per final vertex, local solid thickness in mm
  thicknessGrid?: Float32Array; // front sample at image/skirt row r, column c (r * cols + c)
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
  /** Vertices with a NaN or Infinity component. */
  nonFiniteVertexCount: number;
  /** Edges that belong to exactly one triangle. */
  openBoundaryEdges: number;
  /** Edges shared by more than two triangles. */
  nonManifoldEdges: number;
  /** Adjacent triangles whose normals differ by more than 170°. */
  foldedPairCount: number;
  degenerateTriangles: number;
  warnings: string[];
  eulerCharacteristic: number;
}

export interface PhotoUploadJob {
  id: string;
  fileName: string;
  progress: number;
  status: 'reading' | 'done' | 'error';
  slotId?: string;
  slotIndex?: number;
}
