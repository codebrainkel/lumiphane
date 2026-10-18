import { LithophaneSettings, MeshGeometryData } from '../types/lithophane';
import { WHITE_PLA_EXTINCTION_PER_MM, thicknessForLuminance } from '../constants/optics';
import { clampBorderWidthMm, createBorderIconField } from './borderIcons';

/** Curved, cylinder, and cube feet flare over this height, entirely below the photo. */
export const SUPPORT_BRIM_HEIGHT_MM = 4;

const SKIRT_ROW_PITCH_MM = 0.5;

/**
 * Faces merge only when every corner lies on the seed plane. 0.0005 mm is
 * far under the 0.01 mm thickness tolerance, and it is tighter than the
 * sagitta between neighboring cylinder or arc facets, so curved columns
 * stay faceted.
 */
const COPLANAR_EPSILON_MM = 5e-4;

/**
 * Vertical band added under the photo so the stand, flange, buttress, or brim
 * never thickens the image. Height is the support's own reach; row count
 * samples that band at about 0.5mm.
 */
export function standingBaseExtension(settings: {
  shape: LithophaneSettings['shape'];
  orientation: LithophaneSettings['orientation'];
  supportType?: LithophaneSettings['supportType'];
  supportHeight?: number;
}): { heightMm: number; rows: number } {
  if (settings.orientation === 'flat') return { heightMm: 0, rows: 0 };
  const supportType = settings.supportType || 'flange';
  if (supportType === 'none') return { heightMm: 0, rows: 0 };

  const shape = settings.shape;
  const usesBrim =
    shape === 'curved' ||
    shape === 'nightlight' ||
    shape === 'cylinder' ||
    shape === 'cube' ||
    shape === 'hexagon';
  let heightMm: number;
  if (usesBrim) {
    heightMm = SUPPORT_BRIM_HEIGHT_MM;
  } else {
    const supportHeight = Math.max(2, settings.supportHeight ?? 8);
    const hasButtress = supportType === 'buttress' || supportType === 'full';
    heightMm = hasButtress ? supportHeight * 2.8 : supportHeight;
  }
  const rows = Math.max(2, Math.round(heightMm / SKIRT_ROW_PITCH_MM));
  return { heightMm, rows };
}

export class GeometryGenerator {
  /**
   * Generates a watertight 2-manifold solid mesh from a normalized luminance grid.
   * Default orientation is 'standing' (vertical along Z-axis, base at Z=0 on print bed),
   * with tall-item stabilizing support footing for reliable FDM slicing & printing.
   */
  static generateMesh(
    luminanceGrid: Float32Array,
    cols: number,
    rows: number,
    settings: LithophaneSettings
  ): MeshGeometryData {
    const W = Math.max(10, settings.width);
    const H = Math.max(10, settings.height);
    const minTh = Math.max(0.4, settings.minThickness);
    const maxTh = Math.max(minTh + 0.2, settings.maxThickness);

    const isStanding = settings.orientation !== 'flat'; // Default: standing upright on print bed
    const supportType = settings.supportType || 'flange';
    const supportBaseDepth = Math.max(4, settings.supportBaseDepth ?? 14.0);
    const supportHeight = Math.max(2, settings.supportHeight ?? 8.0);

    // The stand is extra rows under the photo, so image resolution is unchanged.
    const extension = standingBaseExtension(settings);
    const skirtRows = extension.rows;
    const zBase = extension.heightMm;
    const meshRows = rows + skirtRows;

    const N = cols * meshRows;
    const vertexCount = N * 2; // Front grid + Back grid

    const vertices = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const thicknesses = new Float32Array(vertexCount);

    const isCylinder = settings.shape === 'cylinder';
    const isCube = settings.shape === 'cube';
    const isHexagon = settings.shape === 'hexagon';
    const isEnclosed = isCylinder || isCube || isHexagon;

    // Precalculate curved arc and cylinder parameters
    const isCurved = settings.shape === 'curved' || settings.shape === 'nightlight';
    const isConvex = settings.curveDirection !== 'concave'; // default convex (edges wrap backwards away from viewer)
    const curveDeg = Math.max(15, Math.min(180, settings.curveAngle || 75));
    const curveRad = (curveDeg * Math.PI) / 180;
    const arcRadius = W / curveRad;

    const cylinderDiameter = settings.cylinderDiameter || 90;
    const cylinderRadius = cylinderDiameter / 2;

    const cubeWidth = Math.max(30, settings.cubeWidth || 90);
    const cubeHw = cubeWidth / 2;

    const hexagonDiameter = Math.max(40, settings.hexagonDiameter || 90);
    const hexSide = hexagonDiameter / 2;
    const hexApothem = hexSide * (Math.sqrt(3) / 2);

    // Frame parameters. Icons sit on the centerline of this band.
    const hasFrame = settings.hasFrame;
    const frameW = clampBorderWidthMm(settings.shape, W, H, settings.frameWidth || 0);
    const frameTh = Math.max(minTh, settings.frameThickness || maxTh);
    const borderIcon = settings.borderIcon ?? 'none';
    const borderPerimeter = isCube
      ? cubeWidth * 4
      : isHexagon
      ? hexSide * 6
      : Math.PI * cylinderDiameter;
    const iconRelief =
      hasFrame && borderIcon !== 'none'
        ? createBorderIconField(
            isEnclosed
              ? {
                  kind: borderIcon,
                  layout: 'loop',
                  widthMm: borderPerimeter,
                  heightMm: H,
                  frameWidthMm: frameW,
                  alignArcMm: isCube
                    ? cubeWidth / 2
                    : isHexagon
                    ? hexSide / 2
                    : borderPerimeter / (2 * Math.max(1, Math.min(4, settings.cylinderPanelCount || 4))),
                  cornerPeriodMm: isCube ? cubeWidth : isHexagon ? hexSide : 0,
                }
              : {
                  kind: borderIcon,
                  layout: 'rect',
                  widthMm: W,
                  heightMm: H,
                  frameWidthMm: frameW,
                }
          )
        : null;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    // Thickness of the photo's bottom edge, continued through the stand.
    const imageEdgeThickness = new Float32Array(cols);

    // 1. Generate Front and Back Vertices
    // Image rows keep their full height. Skirt rows hang below them down to Z = 0.
    for (let r = 0; r < meshRows; r++) {
      const inSkirt = r >= rows;
      const v = inSkirt ? 1 : r / (rows - 1);
      const pz = inSkirt
        ? zBase * (1 - (r - (rows - 1)) / skirtRows)
        : zBase + (1.0 - v) * H;
      const pyFlat = H / 2 - v * H;

      const distY = Math.min(v, 1.0 - v) * H;

      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const distX = Math.min(u, 1.0 - u) * W;

        // Dark (lum 0) => maxThickness; bright (lum 1) => minThickness.
        // Transmission exp(-k·t) tracks linearized sRGB between those walls.
        let th: number;
        if (!inSkirt) {
          const lum = luminanceGrid[r * cols + c];
          th = thicknessForLuminance(lum, minTh, maxTh, WHITE_PLA_EXTINCTION_PER_MM);

          // Frame reinforcement (for continuous perimeter shapes, frame applies only to top/bottom rims; zero seam gap)
          if (hasFrame) {
            const distBorder = isEnclosed ? distY : Math.min(distX, distY);
            if (distBorder <= frameW) {
              th = Math.max(th, frameTh);
              if (iconRelief) {
                const borderX = isEnclosed ? (c / cols) * borderPerimeter : u * W;
                const cut = iconRelief(borderX, v * H);
                if (cut > 0) th = Math.max(minTh + 0.2, th - cut);
              }
            }
          }
          if (r === rows - 1) imageEdgeThickness[c] = th;
        } else {
          th = imageEdgeThickness[c];
        }

        // Stand flare is applied only on the skirt, never inside the photo.
        let flangeBack = 0;
        let flangeFront = 0;
        let brimExtra = 0;
        if (inSkirt) {
          if (isCube || isCylinder || isHexagon || isCurved) {
            if (pz < SUPPORT_BRIM_HEIGHT_MM) {
              const tBrim = Math.pow(1.0 - pz / SUPPORT_BRIM_HEIGHT_MM, 2);
              brimExtra = (isCurved ? 2.5 : 2.0) * tBrim;
            }
          } else if (isStanding) {
            if (supportType === 'flange' || supportType === 'full') {
              if (pz <= supportHeight) {
                const t = Math.pow(1.0 - pz / supportHeight, 2);
                flangeBack = supportBaseDepth * 0.55 * t;
                flangeFront = supportBaseDepth * 0.45 * t;
              }
            }
            if (supportType === 'buttress' || supportType === 'full') {
              const edgeSpan = 0.16;
              const distFromSide = Math.min(u, 1.0 - u) / edgeSpan;
              const buttressTop = supportHeight * 2.8;
              if (distFromSide <= 1.0 && pz <= buttressTop) {
                const sideFactor = Math.pow(1.0 - distFromSide, 1.5);
                const heightFactor = Math.pow(1.0 - pz / buttressTop, 2);
                flangeBack += supportBaseDepth * 0.75 * sideFactor * heightFactor;
              }
            }
          }
        }

        const fIdx = (r * cols + c) * 3;
        const bIdx = (N + r * cols + c) * 3;

        let fx = 0, fy = 0, fz = 0;
        let bx = 0, by = 0, bz = 0;
        let localThickness = th;

        if (isCube) {
          // ==============================================================
          // 4-SIDED HOLLOW CUBE (Vertical square tube on Z axis, bed at Z=0)
          // ==============================================================
          // 4 vertical walls surrounding center (0, 0, Z) with no top and no bottom.
          // Face 0: Front face (+Y), Face 1: Right face (+X)
          // Face 2: Back face (-Y), Face 3: Left face (-X)
          const sideCols = cols / 4;
          const sideIdx = Math.min(3, Math.floor(c / sideCols));
          const uSide = (c - sideIdx * sideCols) / sideCols; // [0, 1)

          localThickness = th + brimExtra;
          const rIn = cubeHw;
          const rOut = cubeHw + localThickness;

          if (sideIdx === 0) {
            // Face 0: Front (+Y)
            bx = rIn * (2.0 * uSide - 1.0);
            by = rIn;
            fx = rOut * (2.0 * uSide - 1.0);
            fy = rOut;
          } else if (sideIdx === 1) {
            // Face 1: Right (+X)
            bx = rIn;
            by = rIn * (1.0 - 2.0 * uSide);
            fx = rOut;
            fy = rOut * (1.0 - 2.0 * uSide);
          } else if (sideIdx === 2) {
            // Face 2: Back (-Y)
            bx = rIn * (1.0 - 2.0 * uSide);
            by = -rIn;
            fx = rOut * (1.0 - 2.0 * uSide);
            fy = -rOut;
          } else {
            // Face 3: Left (-X)
            bx = -rIn;
            by = rIn * (2.0 * uSide - 1.0);
            fx = -rOut;
            fy = rOut * (2.0 * uSide - 1.0);
          }

          bz = pz;
          fz = pz;
        } else if (isHexagon) {
          // ==============================================================
          // 6-SIDED HOLLOW HEXAGON (Vertical hexagonal tube on Z axis, bed at Z=0)
          // ==============================================================
          // 6 vertical walls surrounding center (0, 0, Z) with open top and bottom.
          // Face 0: Front (+Y, 0°), Face 1: Front-Right (60°), Face 2: Back-Right (120°)
          // Face 3: Back (-Y, 180°), Face 4: Back-Left (240°), Face 5: Front-Left (300°)
          const sideCols = cols / 6;
          const sideIdx = Math.min(5, Math.floor(c / sideCols));
          const uSide = (c - sideIdx * sideCols) / sideCols; // [0, 1)

          const theta = (sideIdx * Math.PI) / 3;
          const nx = Math.sin(theta);
          const ny = Math.cos(theta);
          const tx = ny;
          const ty = -nx;
          const s = (2.0 * uSide - 1.0) / Math.sqrt(3);

          // Unit-apothem regular hexagon point p = n + s * t, where p · n === 1
          const px = nx + s * tx;
          const py = ny + s * ty;

          localThickness = th + brimExtra;
          const rIn = hexApothem;
          const rOut = hexApothem + localThickness;

          bx = rIn * px;
          by = rIn * py;
          bz = pz;

          fx = rOut * px;
          fy = rOut * py;
          fz = pz;
        } else if (isCylinder) {
          // ==============================================================
          // 360° ROUND HOLLOW CYLINDER (Vertical tube on Z axis, bed at Z=0)
          // ==============================================================
          // Center Sector 0 (Front) at phi = 0 facing front camera (+Y)
          // For 1 photo, centers the single wrap photo at Front, putting the seam at the back (180°)
          const numPanels = Math.max(1, Math.min(4, settings.cylinderPanelCount || 4));
          const phiOffset = Math.PI / numPanels;
          const phi = (c / cols) * Math.PI * 2 - phiOffset;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          localThickness = th + brimExtra;
          const rIn = cylinderRadius;
          const rOut = cylinderRadius + localThickness;

          // Inner surface (facing center (0,0,z))
          bx = rIn * sinPhi;
          by = rIn * cosPhi;
          bz = pz;

          // Outer surface
          fx = rOut * sinPhi;
          fy = rOut * cosPhi;
          fz = pz;
        } else if (isStanding) {
          // ==============================================================
          // STANDING ORIENTATION (Z is vertical print height, bed at Z=0)
          // ==============================================================
          if (isCurved) {
            // Curved Arc Lithophane Standing on Build Plate
            const phi = (u - 0.5) * curveRad;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            localThickness = th + brimExtra;
            const baseX = arcRadius * sinPhi;
            const baseY = (isConvex ? -1 : 1) * arcRadius * (1.0 - cosPhi) - brimExtra;

            bx = baseX;
            by = baseY;
            bz = pz;

            fx = baseX + sinPhi * localThickness;
            fy = baseY + cosPhi * localThickness;
            fz = pz;
          } else {
            // Flat Plate Lithophane Standing on Build Plate
            const px = -W / 2 + u * W;

            localThickness = th + flangeFront + flangeBack;

            // Back surface stays flat. Photo thickness grows toward the viewer.
            bx = px;
            by = -flangeBack;
            bz = pz;

            // Front surface
            fx = px;
            fy = th + flangeFront;
            fz = pz;
          }
        } else {
          // ==============================================================
          // FLAT ORIENTATION (Lying flat on bed)
          // ==============================================================
          localThickness = th;
          const px = -W / 2 + u * W;
          if (isCurved) {
            const phi = (u - 0.5) * curveRad;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const nx = sinPhi;
            const nz = cosPhi;
            const baseX = arcRadius * sinPhi;
            const baseZ = (isConvex ? -1 : 1) * arcRadius * (1.0 - cosPhi);

            bx = baseX;
            by = pyFlat;
            bz = baseZ;

            fx = baseX + nx * th;
            fy = pyFlat;
            fz = baseZ + nz * th;
          } else {
            fx = px;
            fy = pyFlat;
            fz = th;

            bx = px;
            by = pyFlat;
            bz = 0;
          }
        }

        // Set Front vertex
        vertices[fIdx] = fx;
        vertices[fIdx + 1] = fy;
        vertices[fIdx + 2] = fz;

        // Set Back vertex
        vertices[bIdx] = bx;
        vertices[bIdx + 1] = by;
        vertices[bIdx + 2] = bz;

        // Record physical thickness in mm for light transmission
        thicknesses[r * cols + c] = localThickness;
        thicknesses[N + r * cols + c] = localThickness;

        // Texture UVs (0 to 1)
        const fUvIdx = (r * cols + c) * 2;
        const bUvIdx = (N + r * cols + c) * 2;
        uvs[fUvIdx] = u;
        uvs[fUvIdx + 1] = 1.0 - v;
        uvs[bUvIdx] = u;
        uvs[bUvIdx + 1] = 1.0 - v;

        // Update bounds
        minX = Math.min(minX, fx, bx);
        maxX = Math.max(maxX, fx, bx);
        minY = Math.min(minY, fy, by);
        maxY = Math.max(maxY, fy, by);
        minZ = Math.min(minZ, fz, bz);
        maxZ = Math.max(maxZ, fz, bz);
      }
    }

    // 2. Lossless merge: flat backs, frames, and equal-height runs become
    // one polygon per edge loop. Curved facets stay split. Windings match
    // the per-pixel quads this replaced, and the bed stays at Z = 0.
    const simplified = this.simplifyRegions(
      vertices,
      uvs,
      thicknesses,
      cols,
      meshRows,
      rows,
      isEnclosed,
      isEnclosed || isStanding,
      isEnclosed ? 'rim' : isStanding ? 'standing' : 'flat',
    );

    return {
      vertices: simplified.vertices,
      indices: simplified.indices,
      normals: simplified.normals,
      uvs: simplified.uvs,
      thicknesses: simplified.thicknesses,
      thicknessGrid: simplified.thicknessGrid,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ],
      },
      gridResolution: { cols, rows },
    };
  }

  /**
   * Replaces the per-pixel grid with coplanar rectangles. A vertex stays only
   * when it is a rectangle corner, and every polygon inserts those corners
   * along its edges so neighbors share the same segments (no T-junctions).
   */
  private static simplifyRegions(
    vertices: Float32Array,
    uvs: Float32Array,
    thicknesses: Float32Array,
    cols: number,
    meshRows: number,
    imageRows: number,
    wrapping: boolean,
    frontCcw: boolean,
    wallMode: 'rim' | 'standing' | 'flat',
  ): {
    vertices: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
    uvs: Float32Array;
    thicknesses: Float32Array;
    thicknessGrid: Float32Array;
  } {
    const N = cols * meshRows;
    const cellRows = meshRows - 1;
    const cellCols = wrapping ? cols : cols - 1;
    const kept = new Uint8Array(N * 2);
    const tris: number[] = [];
    const extraX: number[] = [];
    const extraY: number[] = [];
    const extraZ: number[] = [];
    const extraU: number[] = [];
    const extraV: number[] = [];
    const extraTh: number[] = [];

    type Plane = { ax: number; ay: number; az: number; nx: number; ny: number; nz: number; inv: number };
    type Rect = { side: number; r0: number; c0: number; r1: number; c1: number };

    const vidAt = (side: number, r: number, c: number) =>
      side * N + r * cols + (c >= cols ? 0 : c);

    const planeFrom = (a: number, b: number, c: number): Plane | null => {
      const ia = a * 3;
      const ib = b * 3;
      const ic = c * 3;
      const ax = vertices[ia];
      const ay = vertices[ia + 1];
      const az = vertices[ia + 2];
      const abx = vertices[ib] - ax;
      const aby = vertices[ib + 1] - ay;
      const abz = vertices[ib + 2] - az;
      const acx = vertices[ic] - ax;
      const acy = vertices[ic + 1] - ay;
      const acz = vertices[ic + 2] - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-8) return null;
      return { ax, ay, az, nx, ny, nz, inv: 1 / len };
    };

    const onPlane = (p: Plane, id: number) => {
      const i = id * 3;
      const d =
        (vertices[i] - p.ax) * p.nx +
        (vertices[i + 1] - p.ay) * p.ny +
        (vertices[i + 2] - p.az) * p.nz;
      return Math.abs(d) * p.inv <= COPLANAR_EPSILON_MM;
    };

    const cellIds = (side: number, r: number, c: number) => {
      const c1 = wrapping && c === cols - 1 ? cols : c + 1;
      return [
        vidAt(side, r, c),
        vidAt(side, r, c1),
        vidAt(side, r + 1, c1),
        vidAt(side, r + 1, c),
      ];
    };

    const cellPlane = (side: number, r: number, c: number): Plane | null => {
      const ids = cellIds(side, r, c);
      const combos = [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ];
      for (let i = 0; i < combos.length; i++) {
        const combo = combos[i];
        const p = planeFrom(ids[combo[0]], ids[combo[1]], ids[combo[2]]);
        if (!p) continue;
        if (onPlane(p, ids[0]) && onPlane(p, ids[1]) && onPlane(p, ids[2]) && onPlane(p, ids[3])) return p;
      }
      return null;
    };

    const cellOn = (p: Plane, side: number, r: number, c: number) => {
      const ids = cellIds(side, r, c);
      return onPlane(p, ids[0]) && onPlane(p, ids[1]) && onPlane(p, ids[2]) && onPlane(p, ids[3]);
    };

    const rects: Rect[] = [];
    for (let side = 0; side < 2; side++) {
      const visited = new Uint8Array(cellRows * cellCols);
      for (let r = 0; r < cellRows; r++) {
        for (let c = 0; c < cellCols; c++) {
          if (visited[r * cellCols + c]) continue;
          const plane = cellPlane(side, r, c);
          let w = 1;
          let h = 1;
          const seam = wrapping && c === cellCols - 1;
          if (plane && !seam) {
            while (c + w < cellCols && !(wrapping && c + w === cellCols - 1)) {
              if (visited[r * cellCols + (c + w)] || !cellOn(plane, side, r, c + w)) break;
              w++;
            }
            // Cells at and below imageRows-1 step onto the stand. The stand is
            // coplanar with the wall at the middle of a curve, where the brim
            // flare cancels. Folding it into the photo stretches that column's
            // texture down to the bed and pinches the picture at the center.
            const photoCells = Math.max(0, imageRows - 1);
            while (r + h < cellRows && !(r < photoCells && r + h >= photoCells)) {
              let ok = true;
              for (let k = 0; k < w; k++) {
                if (visited[(r + h) * cellCols + (c + k)] || !cellOn(plane, side, r + h, c + k)) {
                  ok = false;
                  break;
                }
              }
              if (!ok) break;
              h++;
            }
          }
          for (let rr = 0; rr < h; rr++) {
            for (let cc = 0; cc < w; cc++) visited[(r + rr) * cellCols + (c + cc)] = 1;
          }
          const c1 = seam ? cols : c + w;
          rects.push({ side, r0: r, c0: c, r1: r + h, c1 });
          kept[vidAt(side, r, c)] = 1;
          kept[vidAt(side, r, c1)] = 1;
          kept[vidAt(side, r + h, c)] = 1;
          kept[vidAt(side, r + h, c1)] = 1;
        }
      }
    }

    const area2 = (a: number, b: number, c: number) => {
      const ia = a * 3;
      const ib = b * 3;
      const ic = c * 3;
      const abx = vertices[ib] - vertices[ia];
      const aby = vertices[ib + 1] - vertices[ia + 1];
      const abz = vertices[ib + 2] - vertices[ia + 2];
      const acx = vertices[ic] - vertices[ia];
      const acy = vertices[ic + 1] - vertices[ia + 1];
      const acz = vertices[ic + 2] - vertices[ia + 2];
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      return cx * cx + cy * cy + cz * cz;
    };

    const appendEdge = (loop: number[], side: number, rowA: number, colA: number, rowB: number, colB: number) => {
      if (rowA === rowB && (colA >= cols || colB >= cols)) {
        const c = colA >= cols ? 0 : colA;
        loop.push(side * N + rowA * cols + c);
        return;
      }
      const cStart = colA >= cols ? 0 : colA;
      const cEnd = colB >= cols ? 0 : colB;
      if (rowA === rowB) {
        const step = cEnd > cStart ? 1 : -1;
        for (let c = cStart; c !== cEnd; c += step) {
          const id = side * N + rowA * cols + c;
          if (c === cStart || kept[id]) loop.push(id);
        }
        return;
      }
      const step = rowB > rowA ? 1 : -1;
      for (let r = rowA; r !== rowB; r += step) {
        const id = side * N + r * cols + cStart;
        if (r === rowA || kept[id]) loop.push(id);
      }
    };

    const emitFan = (loop: number[]) => {
      const n = loop.length;
      if (n < 3) return;
      if (n === 3) {
        tris.push(loop[0], loop[1], loop[2]);
        return;
      }
      for (let origin = 0; origin < n; origin++) {
        const a = loop[origin];
        let ok = true;
        for (let k = 1; k < n - 1; k++) {
          const b = loop[(origin + k) % n];
          const c = loop[(origin + k + 1) % n];
          if (a === b || b === c || a === c || area2(a, b, c) < 1e-12) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (let k = 1; k < n - 1; k++) {
          tris.push(a, loop[(origin + k) % n], loop[(origin + k + 1) % n]);
        }
        return;
      }
      let x = 0;
      let y = 0;
      let z = 0;
      let u = 0;
      let v = 0;
      let th = 0;
      for (let i = 0; i < n; i++) {
        const id = loop[i];
        x += vertices[id * 3];
        y += vertices[id * 3 + 1];
        z += vertices[id * 3 + 2];
        u += uvs[id * 2];
        v += uvs[id * 2 + 1];
        th += thicknesses[id];
      }
      const inv = 1 / n;
      const cid = N * 2 + extraX.length;
      extraX.push(x * inv);
      extraY.push(y * inv);
      extraZ.push(z * inv);
      extraU.push(u * inv);
      extraV.push(v * inv);
      extraTh.push(th * inv);
      for (let i = 0; i < n; i++) tris.push(loop[i], loop[(i + 1) % n], cid);
    };

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const loop: number[] = [];
      appendEdge(loop, rect.side, rect.r0, rect.c0, rect.r0, rect.c1);
      appendEdge(loop, rect.side, rect.r0, rect.c1, rect.r1, rect.c1);
      appendEdge(loop, rect.side, rect.r1, rect.c1, rect.r1, rect.c0);
      appendEdge(loop, rect.side, rect.r1, rect.c0, rect.r0, rect.c0);
      if ((rect.side === 0) !== frontCcw) loop.reverse();
      emitFan(loop);
    }

    const chainRow = (side: number, row: number, wrap: boolean) => {
      const ids: number[] = [];
      const keys: number[] = [];
      const base = side * N + row * cols;
      for (let c = 0; c < cols; c++) {
        if (kept[base + c]) {
          ids.push(base + c);
          keys.push(c);
        }
      }
      if (wrap && ids.length > 0) {
        ids.push(ids[0]);
        keys.push(cols);
      }
      return { ids, keys };
    };

    const chainCol = (side: number, col: number) => {
      const ids: number[] = [];
      const keys: number[] = [];
      for (let r = 0; r < meshRows; r++) {
        const id = side * N + r * cols + col;
        if (kept[id]) {
          ids.push(id);
          keys.push(r);
        }
      }
      return { ids, keys };
    };

    const stitch = (
      front: { ids: number[]; keys: number[] },
      back: { ids: number[]; keys: number[] },
      pattern: 'top' | 'bot',
    ) => {
      if (front.ids.length < 2 || back.ids.length < 2) {
        throw new Error('Lithophane boundary chain is missing its corners');
      }
      let i = 0;
      let j = 0;
      const fi = front.ids.length;
      const bi = back.ids.length;
      while (i < fi - 1 || j < bi - 1) {
        const canF = i < fi - 1;
        const canB = j < bi - 1;
        const advF = !canB || (canF && front.keys[i + 1] < back.keys[j + 1]);
        if (advF) {
          const a = front.ids[i];
          const b = front.ids[i + 1];
          const c = back.ids[j];
          if (pattern === 'top') tris.push(a, c, b);
          else tris.push(a, b, c);
          i++;
        } else {
          const a = front.ids[i];
          const b = back.ids[j];
          const c = back.ids[j + 1];
          if (pattern === 'top') tris.push(a, b, c);
          else tris.push(a, c, b);
          j++;
        }
      }
    };

    const emitWall = (kind: 'row' | 'col', index: number, pattern: 'top' | 'bot', wrap: boolean) => {
      const front = kind === 'row' ? chainRow(0, index, wrap) : chainCol(0, index);
      const back = kind === 'row' ? chainRow(1, index, wrap) : chainCol(1, index);
      stitch(front, back, pattern);
    };

    if (wallMode === 'rim') {
      emitWall('row', 0, 'top', true);
      emitWall('row', meshRows - 1, 'bot', true);
    } else if (wallMode === 'standing') {
      emitWall('row', 0, 'top', false);
      emitWall('row', meshRows - 1, 'bot', false);
      emitWall('col', 0, 'bot', false);
      emitWall('col', cols - 1, 'top', false);
    } else {
      emitWall('row', 0, 'bot', false);
      emitWall('row', meshRows - 1, 'top', false);
      emitWall('col', 0, 'top', false);
      emitWall('col', cols - 1, 'bot', false);
    }

    const slotCount = N * 2 + extraX.length;
    const remap = new Int32Array(slotCount);
    remap.fill(-1);
    let used = 0;
    for (let i = 0; i < tris.length; i++) {
      const id = tris[i];
      if (remap[id] === -1) remap[id] = used++;
    }

    const outV = new Float32Array(used * 3);
    const outN = new Float32Array(used * 3);
    const outUV = new Float32Array(used * 2);
    const outTh = new Float32Array(used);
    for (let id = 0; id < slotCount; id++) {
      const ni = remap[id];
      if (ni < 0) continue;
      if (id < N * 2) {
        outV[ni * 3] = vertices[id * 3];
        outV[ni * 3 + 1] = vertices[id * 3 + 1];
        outV[ni * 3 + 2] = vertices[id * 3 + 2];
        outUV[ni * 2] = uvs[id * 2];
        outUV[ni * 2 + 1] = uvs[id * 2 + 1];
        outTh[ni] = thicknesses[id];
      } else {
        const e = id - N * 2;
        outV[ni * 3] = extraX[e];
        outV[ni * 3 + 1] = extraY[e];
        outV[ni * 3 + 2] = extraZ[e];
        outUV[ni * 2] = extraU[e];
        outUV[ni * 2 + 1] = extraV[e];
        outTh[ni] = extraTh[e];
      }
    }

    const outI = new Uint32Array(tris.length);
    for (let i = 0; i < tris.length; i++) outI[i] = remap[tris[i]];
    this.computeNormals(outV, outI, outN);

    return {
      vertices: outV,
      indices: outI,
      normals: outN,
      uvs: outUV,
      thicknesses: outTh,
      thicknessGrid: thicknesses.slice(0, N),
    };
  }

  /**
   * Computes smooth vertex normals by accumulating weighted triangle face normals.
   */
  private static computeNormals(
    vertices: Float32Array,
    indices: Uint32Array,
    normals: Float32Array
  ): void {
    normals.fill(0);

    const numTriangles = indices.length / 3;
    for (let i = 0; i < numTriangles; i++) {
      const i0 = indices[i * 3] * 3;
      const i1 = indices[i * 3 + 1] * 3;
      const i2 = indices[i * 3 + 2] * 3;

      const ax = vertices[i0];
      const ay = vertices[i0 + 1];
      const az = vertices[i0 + 2];

      const bx = vertices[i1];
      const by = vertices[i1 + 1];
      const bz = vertices[i1 + 2];

      const cx = vertices[i2];
      const cy = vertices[i2 + 1];
      const cz = vertices[i2 + 2];

      // Edges AB and AC
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;

      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;

      // Cross product AB x AC
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const fLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (fLen <= 1e-8) continue;
      const invFLen = 1.0 / fLen;
      nx *= invFLen;
      ny *= invFLen;
      nz *= invFLen;

      // Angle-weighted accumulation so large simplified rectangles do not skew
      // normals along their boundary vertices and triangle fans stay invariant
      // to how coplanar rectangles are triangulated.
      const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
      const lenAC = Math.sqrt(acx * acx + acy * acy + acz * acz);
      const bcx = cx - bx;
      const bcy = cy - by;
      const bcz = cz - bz;
      const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
      if (lenAB <= 1e-8 || lenAC <= 1e-8 || lenBC <= 1e-8) continue;

      const cosA = Math.max(-1, Math.min(1, (abx * acx + aby * acy + abz * acz) / (lenAB * lenAC)));
      const cosB = Math.max(-1, Math.min(1, -(abx * bcx + aby * bcy + abz * bcz) / (lenAB * lenBC)));
      const cosC = Math.max(-1, Math.min(1, (acx * bcx + acy * bcy + acz * bcz) / (lenAC * lenBC)));

      const wA = Math.acos(cosA);
      const wB = Math.acos(cosB);
      const wC = Math.acos(cosC);

      normals[i0] += nx * wA;
      normals[i0 + 1] += ny * wA;
      normals[i0 + 2] += nz * wA;

      normals[i1] += nx * wB;
      normals[i1 + 1] += ny * wB;
      normals[i1 + 2] += nz * wB;

      normals[i2] += nx * wC;
      normals[i2 + 1] += ny * wC;
      normals[i2 + 2] += nz * wC;
    }

    // Normalize all vertex normals
    const numVerts = vertices.length / 3;
    for (let i = 0; i < numVerts; i++) {
      const idx = i * 3;
      const nx = normals[idx];
      const ny = normals[idx + 1];
      const nz = normals[idx + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-7) {
        normals[idx] = nx / len;
        normals[idx + 1] = ny / len;
        normals[idx + 2] = nz / len;
      } else {
        normals[idx + 1] = 1.0;
      }
    }
  }
}
