import { LithophaneSettings, MeshGeometryData } from '../types/lithophane';
import { WHITE_PLA_EXTINCTION_PER_MM, thicknessForLuminance } from '../constants/optics';
import { clampBorderWidthMm, createBorderIconField } from './borderIcons';

/** Curved, cylinder, and cube feet flare over this height, entirely below the photo. */
export const SUPPORT_BRIM_HEIGHT_MM = 4;

const SKIRT_ROW_PITCH_MM = 0.5;

/**
 * Maximum a merged face may move the solid along its thickness axis.
 * The test used to be a perpendicular distance, which on a steep face
 * allows many times that error in thickness. Curved columns stay split:
 * the allowance is still tighter than the sagitta between arc facets.
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
  const usesBrim = shape === 'curved' || shape === 'nightlight' || shape === 'cylinder' || shape === 'cube';
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
    const isEnclosed = isCylinder || isCube;

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

    // Frame parameters. Icons sit on the centerline of this band.
    const hasFrame = settings.hasFrame;
    const frameW = clampBorderWidthMm(settings.shape, W, H, settings.frameWidth || 0);
    const frameTh = Math.max(minTh, settings.frameThickness || maxTh);
    const borderIcon = settings.borderIcon ?? 'none';
    const borderPerimeter = isCube ? cubeWidth * 4 : Math.PI * cylinderDiameter;
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
                    : borderPerimeter / (2 * Math.max(1, Math.min(4, settings.cylinderPanelCount || 4))),
                  cornerPeriodMm: isCube ? cubeWidth : 0,
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

          // Frame reinforcement. Enclosed shapes keep the frame on the top and
          // bottom rims only. The inner edge of the band ramps from frameTh
          // down to minTh so the band is not a square overhang. The ramp stays
          // inside the band; the photo itself is left unchanged.
          if (hasFrame) {
            const distBorder = isEnclosed ? distY : Math.min(distX, distY);
            if (distBorder <= frameW) {
              const drop = Math.max(0, frameTh - minTh);
              const chamferW = Math.min(drop, 0.6 * frameW);
              let bandTh = frameTh;
              if (chamferW > 1e-9 && distBorder > frameW - chamferW) {
                const along = (distBorder - (frameW - chamferW)) / chamferW;
                bandTh = frameTh - drop * along;
              }
              th = Math.max(th, bandTh);
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
          if (isCube || isCylinder || isCurved) {
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

          if (sideIdx === 0) {
            // Face 0: Front (+Y)
            bx = cubeHw * (2.0 * uSide - 1.0);
            by = cubeHw;
            fx = (cubeHw + localThickness) * (2.0 * uSide - 1.0);
            fy = cubeHw + localThickness;
          } else if (sideIdx === 1) {
            // Face 1: Right (+X)
            bx = cubeHw;
            by = cubeHw * (1.0 - 2.0 * uSide);
            fx = cubeHw + localThickness;
            fy = (cubeHw + localThickness) * (1.0 - 2.0 * uSide);
          } else if (sideIdx === 2) {
            // Face 2: Back (-Y)
            bx = cubeHw * (1.0 - 2.0 * uSide);
            by = -cubeHw;
            fx = (cubeHw + localThickness) * (1.0 - 2.0 * uSide);
            fy = -(cubeHw + localThickness);
          } else {
            // Face 3: Left (-X)
            bx = -cubeHw;
            by = cubeHw * (2.0 * uSide - 1.0);
            fx = -(cubeHw + localThickness);
            fy = (cubeHw + localThickness) * (2.0 * uSide - 1.0);
          }

          bz = pz;
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

          // Inner smooth bore (facing center (0,0,z))
          bx = cylinderRadius * sinPhi;
          by = cylinderRadius * cosPhi;
          bz = pz;

          // Outer surface modulated by image luminance
          const rOut = cylinderRadius + localThickness;
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

            if (isConvex) {
              // Convex: center bows forward, edges sweep backward in Y
              bx = arcRadius * sinPhi;
              by = -arcRadius * (1.0 - cosPhi) - brimExtra;
              bz = pz;

              fx = bx + sinPhi * (th + brimExtra);
              fy = by + cosPhi * (th + brimExtra);
              fz = pz;
            } else {
              // Concave: edges sweep forward in Y
              bx = arcRadius * sinPhi;
              by = arcRadius * (1.0 - cosPhi) - brimExtra;
              bz = pz;

              fx = bx + sinPhi * (th + brimExtra);
              fy = by + cosPhi * (th + brimExtra);
              fz = pz;
            }
          } else {
            // Flat Plate Lithophane Standing on Build Plate
            const px = -W / 2 + u * W;

            localThickness = th + flangeFront + flangeBack;

            // Back surface at Y <= 0
            bx = px;
            by = -flangeBack;
            bz = pz;

            // Front surface at Y >= th
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

            if (isConvex) {
              bx = arcRadius * sinPhi;
              by = pyFlat;
              bz = -arcRadius * (1.0 - cosPhi);

              fx = bx + nx * th;
              fy = pyFlat;
              fz = bz + nz * th;
            } else {
              bx = arcRadius * sinPhi;
              by = pyFlat;
              bz = arcRadius * (1.0 - cosPhi);

              fx = bx + nx * th;
              fy = pyFlat;
              fz = bz + nz * th;
            }
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
      const perp = Math.abs(d) * p.inv;
      const local = id >= N ? id - N : id;
      const fi = local * 3;
      const bi = (N + local) * 3;
      let ax = vertices[fi] - vertices[bi];
      let ay = vertices[fi + 1] - vertices[bi + 1];
      let az = vertices[fi + 2] - vertices[bi + 2];
      const axisLen = Math.hypot(ax, ay, az);
      if (axisLen < 1e-8) return perp <= COPLANAR_EPSILON_MM;
      ax /= axisLen;
      ay /= axisLen;
      az /= axisLen;
      const align = Math.abs((p.nx * ax + p.ny * ay + p.nz * az) * p.inv);
      // perp / align is the shift along the thickness axis. Steep faces
      // (small align) may move only a tiny perpendicular distance.
      return perp <= COPLANAR_EPSILON_MM * align;
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
            while (r + h < cellRows) {
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

    const xyzOf = (id: number): [number, number, number] => {
      if (id >= N * 2) {
        const e = id - N * 2;
        return [extraX[e], extraY[e], extraZ[e]];
      }
      const i = id * 3;
      return [vertices[i], vertices[i + 1], vertices[i + 2]];
    };

    const attribOf = (id: number) => {
      if (id >= N * 2) {
        const e = id - N * 2;
        return { u: extraU[e], v: extraV[e], th: extraTh[e] };
      }
      return { u: uvs[id * 2], v: uvs[id * 2 + 1], th: thicknesses[id] };
    };

    const area2 = (a: number, b: number, c: number) => {
      const pa = xyzOf(a);
      const pb = xyzOf(b);
      const pc = xyzOf(c);
      const abx = pb[0] - pa[0];
      const aby = pb[1] - pa[1];
      const abz = pb[2] - pa[2];
      const acx = pc[0] - pa[0];
      const acy = pc[1] - pa[1];
      const acz = pc[2] - pa[2];
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

    const MIN_TRI_AREA_MM2 = 1e-6;
    const MIN_TRI_ANGLE = (0.5 * Math.PI) / 180;

    const fanOk = (a: number, b: number, c: number) => {
      if (a === b || b === c || a === c) return false;
      const pa = xyzOf(a);
      const pb = xyzOf(b);
      const pc = xyzOf(c);
      const abx = pb[0] - pa[0];
      const aby = pb[1] - pa[1];
      const abz = pb[2] - pa[2];
      const acx = pc[0] - pa[0];
      const acy = pc[1] - pa[1];
      const acz = pc[2] - pa[2];
      const cx = aby * acz - abz * acy;
      const cy = abz * acx - abx * acz;
      const cz = abx * acy - aby * acx;
      const area = 0.5 * Math.hypot(cx, cy, cz);
      if (area < 1e-6) return false;
      const lab = Math.hypot(abx, aby, abz);
      const lbc = Math.hypot(pc[0] - pb[0], pc[1] - pb[1], pc[2] - pb[2]);
      const lca = Math.hypot(pa[0] - pc[0], pa[1] - pc[1], pa[2] - pc[2]);
      const ang = (u: number, v: number, opp: number) => {
        if (u < 1e-9 || v < 1e-9) return 0;
        const cosine = (u * u + v * v - opp * opp) / (2 * u * v);
        return Math.acos(Math.max(-1, Math.min(1, cosine)));
      };
      const minAngle = Math.min(ang(lab, lca, lbc), ang(lab, lbc, lca), ang(lbc, lca, lab));
      return minAngle >= (0.5 * Math.PI) / 180;
    };

    // A corner fan is used only when every triangle clears the sliver limits.
    // Near-collinear edge points (inside the coplanar tolerance) used to emit
    // needles because the old area check was far below 1e-6 mm².
    const tryFan = (loop: number[], commit = true) => {
      const ring: number[] = [];
      for (let i = 0; i < loop.length; i++) {
        if (ring.length === 0 || ring[ring.length - 1] !== loop[i]) ring.push(loop[i]);
      }
      if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
      const n = ring.length;
      if (n < 3) return false;
      if (n === 3) {
        if (!fanOk(ring[0], ring[1], ring[2])) return false;
        if (commit) tris.push(ring[0], ring[1], ring[2]);
        return true;
      }
      for (let origin = 0; origin < n; origin++) {
        const a = ring[origin];
        let ok = true;
        for (let k = 1; k < n - 1; k++) {
          if (!fanOk(a, ring[(origin + k) % n], ring[(origin + k + 1) % n])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        if (commit) {
          for (let k = 1; k < n - 1; k++) {
            tris.push(a, ring[(origin + k) % n], ring[(origin + k + 1) % n]);
          }
        }
        return true;
      }
      return false;
    };

    const triMetrics = (a: number, b: number, c: number) => {
      const pa = xyzOf(a);
      const pb = xyzOf(b);
      const pc = xyzOf(c);
      const e = (p: [number, number, number], q: [number, number, number]) =>
        Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const lab = e(pa, pb);
      const lbc = e(pb, pc);
      const lca = e(pc, pa);
      const area = 0.5 * Math.sqrt(area2(a, b, c));
      const ang = (u: number, v: number, opp: number) => {
        if (u < 1e-12 || v < 1e-12) return 0;
        const cosine = (u * u + v * v - opp * opp) / (2 * u * v);
        return Math.acos(Math.max(-1, Math.min(1, cosine)));
      };
      const minAngle = Math.min(ang(lab, lca, lbc), ang(lab, lbc, lca), ang(lbc, lca, lab));
      const edges: Array<{ u: number; v: number; len: number }> = [
        { u: a, v: b, len: lab },
        { u: b, v: c, len: lbc },
        { u: c, v: a, len: lca },
      ];
      edges.sort((p, q) => q.len - p.len);
      return { area, minAngle, edges };
    };

    // Park an interior vertex near the short edge of a needle. The original
    // edges stay in place, so neighbours and the wall are untouched.
    const addInterior = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, aId: number, bId: number) => {
      const aa = attribOf(aId);
      const bb = attribOf(bId);
      const id = N * 2 + extraX.length;
      extraX.push((ax + bx) / 2);
      extraY.push((ay + by) / 2);
      extraZ.push((az + bz) / 2);
      extraU.push((aa.u + bb.u) / 2);
      extraV.push((aa.v + bb.v) / 2);
      extraTh.push((aa.th + bb.th) / 2);
      return id;
    };

    const refineNeedles = () => {
      const faces: Array<[number, number, number]> = [];
      for (let i = 0; i < tris.length; i += 3) faces.push([tris[i], tris[i + 1], tris[i + 2]]);
      const maxFaces = faces.length * 8 + 64;
      for (let pass = 0; pass < 16 && faces.length < maxFaces; pass++) {
        const next: Array<[number, number, number]> = [];
        let split = 0;
        for (let i = 0; i < faces.length; i++) {
          const tri = faces[i];
          const m = triMetrics(tri[0], tri[1], tri[2]);
          if ((m.area >= MIN_TRI_AREA_MM2 && m.minAngle >= MIN_TRI_ANGLE) || faces.length + split * 2 >= maxFaces) {
            next.push(tri);
            continue;
          }
          // Shortest edge is edges[2] after the descending sort.
          const short = m.edges[2];
          const opp = tri[0] !== short.u && tri[0] !== short.v ? tri[0] : tri[1] !== short.u && tri[1] !== short.v ? tri[1] : tri[2];
          const su = xyzOf(short.u);
          const sv = xyzOf(short.v);
          const ow = xyzOf(opp);
          const mx = (su[0] + sv[0]) / 2;
          const my = (su[1] + sv[1]) / 2;
          const mz = (su[2] + sv[2]) / 2;
          const ex = sv[0] - su[0];
          const ey = sv[1] - su[1];
          const ez = sv[2] - su[2];
          const wx = ow[0] - su[0];
          const wy = ow[1] - su[1];
          const wz = ow[2] - su[2];
          let nx = ey * wz - ez * wy;
          let ny = ez * wx - ex * wz;
          let nz = ex * wy - ey * wx;
          // In-plane perpendicular to the short edge, aimed at the opposite vertex.
          let pxd = ny * ez - nz * ey;
          let pyd = nz * ex - nx * ez;
          let pzd = nx * ey - ny * ex;
          const plen = Math.hypot(pxd, pyd, pzd);
          const toward = (ow[0] - mx) * pxd + (ow[1] - my) * pyd + (ow[2] - mz) * pzd;
          if (toward < 0) {
            pxd = -pxd;
            pyd = -pyd;
            pzd = -pzd;
          }
          if (plen < 1e-10 || short.len < 1e-4) {
            next.push(tri);
            continue;
          }
          const altitude = Math.abs(toward) / plen;
          const reach = Math.min(short.len * 1.5, Math.max(altitude * 0.35, short.len * 0.75));
          const ppx = mx + (pxd / plen) * reach;
          const ppy = my + (pyd / plen) * reach;
          const ppz = mz + (pzd / plen) * reach;
          const childAngle = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
            const d = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
              Math.hypot(x1 - x0, y1 - y0, z1 - z0);
            const lab = d(ax, ay, az, bx, by, bz);
            const lbc = d(bx, by, bz, cx, cy, cz);
            const lca = d(cx, cy, cz, ax, ay, az);
            const ang = (u: number, v: number, oppLen: number) => {
              if (u < 1e-12 || v < 1e-12) return 0;
              const cosine = (u * u + v * v - oppLen * oppLen) / (2 * u * v);
              return Math.acos(Math.max(-1, Math.min(1, cosine)));
            };
            return Math.min(ang(lab, lca, lbc), ang(lab, lbc, lca), ang(lbc, lca, lab));
          };
          const ou = ow[0];
          const ov = ow[1];
          const oz = ow[2];
          const worstChild = Math.min(
            childAngle(su[0], su[1], su[2], sv[0], sv[1], sv[2], ppx, ppy, ppz),
            childAngle(sv[0], sv[1], sv[2], ou, ov, oz, ppx, ppy, ppz),
            childAngle(ou, ov, oz, su[0], su[1], su[2], ppx, ppy, ppz),
          );
          // Keep the split only when every child clears the angle floor.
          // Nibbling a long needle otherwise multiplies triangles and still fails.
          if (worstChild < MIN_TRI_ANGLE) {
            next.push(tri);
            continue;
          }
          const pid = addInterior(mx, my, mz, ppx, ppy, ppz, short.u, opp);
          extraX[extraX.length - 1] = mx + (pxd / plen) * reach;
          extraY[extraY.length - 1] = my + (pyd / plen) * reach;
          extraZ[extraZ.length - 1] = mz + (pzd / plen) * reach;
          const iu = tri.indexOf(short.u);
          const iv = tri.indexOf(short.v);
          const forward = (iu + 1) % 3 === iv;
          if (forward) {
            next.push([short.u, short.v, pid]);
            next.push([short.v, opp, pid]);
            next.push([opp, short.u, pid]);
          } else {
            next.push([short.v, short.u, pid]);
            next.push([opp, short.v, pid]);
            next.push([short.u, opp, pid]);
          }
          split++;
        }
        faces.length = 0;
        for (let i = 0; i < next.length; i++) faces.push(next[i]);
        if (split === 0) break;
      }
      tris.length = 0;
      for (let i = 0; i < faces.length; i++) tris.push(faces[i][0], faces[i][1], faces[i][2]);
    };

    // Boundary rows and columns must keep the same columns on the front and the
    // back. Zipping mismatched chains folds triangles onto the bed.
    const uniteKept = (kind: 'row' | 'col', index: number) => {
      if (kind === 'row') {
        for (let c = 0; c < cols; c++) {
          const front = vidAt(0, index, c);
          const back = vidAt(1, index, c);
          if (kept[front] || kept[back]) {
            kept[front] = 1;
            kept[back] = 1;
          }
        }
        return;
      }
      for (let r = 0; r < meshRows; r++) {
        const front = vidAt(0, r, index);
        const back = vidAt(1, r, index);
        if (kept[front] || kept[back]) {
          kept[front] = 1;
          kept[back] = 1;
        }
      }
    };
    // Long thin regions cannot be fanned from a corner: the far apex sees the
    // short edge edge-on. Sample both long edges at the same grid columns so a
    // strip of quads stays above 0.5°. Neighbours share those vertices.
    const STRIP_TAN = Math.tan((0.7 * Math.PI) / 180);
    const edgeLen = (a: number, b: number) => {
      const pa = xyzOf(a);
      const pb = xyzOf(b);
      return Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    };
    const colOf = (c: number) => (c >= cols ? 0 : c);
    const reinforceRect = (rect: Rect) => {
      const { side, r0, c0, r1, c1 } = rect;
      const horiz = Math.max(edgeLen(vidAt(side, r0, c0), vidAt(side, r0, c1)), edgeLen(vidAt(side, r1, c0), vidAt(side, r1, c1)));
      const vert = Math.max(edgeLen(vidAt(side, r0, c0), vidAt(side, r1, c0)), edgeLen(vidAt(side, r0, c1), vidAt(side, r1, c1)));
      const minor = Math.min(horiz, vert);
      const major = Math.max(horiz, vert);
      if (!(minor > 1e-4) || major <= minor / STRIP_TAN) return;
      const maxSeg = Math.max(minor / STRIP_TAN, 1e-3);
      if (horiz >= vert) {
        const seeds: number[] = [];
        for (let c = c0; c <= c1; c++) {
          const cc = colOf(c);
          if (c === c0 || c === c1 || kept[vidAt(side, r0, cc)] || kept[vidAt(side, r1, cc)]) seeds.push(c);
        }
        for (let i = 0; i < seeds.length - 1; i++) {
          const a = seeds[i];
          const b = seeds[i + 1];
          const span = b - a;
          if (span <= 1) continue;
          const L = Math.max(edgeLen(vidAt(side, r0, colOf(a)), vidAt(side, r0, colOf(b))), edgeLen(vidAt(side, r1, colOf(a)), vidAt(side, r1, colOf(b))));
          let parts = Math.ceil(L / maxSeg);
          if (parts > span) parts = span;
          for (let p = 1; p < parts; p++) {
            const c = a + Math.round((span * p) / parts);
            if (c <= a || c >= b) continue;
            const cc = colOf(c);
            kept[vidAt(side, r0, cc)] = 1;
            kept[vidAt(side, r1, cc)] = 1;
          }
        }
      } else {
        const seeds: number[] = [];
        for (let r = r0; r <= r1; r++) {
          if (r === r0 || r === r1 || kept[vidAt(side, r, c0)] || kept[vidAt(side, r, c1)]) seeds.push(r);
        }
        for (let i = 0; i < seeds.length - 1; i++) {
          const a = seeds[i];
          const b = seeds[i + 1];
          const span = b - a;
          if (span <= 1) continue;
          const L = Math.max(edgeLen(vidAt(side, a, c0), vidAt(side, b, c0)), edgeLen(vidAt(side, a, c1), vidAt(side, b, c1)));
          let parts = Math.ceil(L / maxSeg);
          if (parts > span) parts = span;
          for (let p = 1; p < parts; p++) {
            const r = a + Math.round((span * p) / parts);
            if (r <= a || r >= b) continue;
            kept[vidAt(side, r, c0)] = 1;
            kept[vidAt(side, r, c1)] = 1;
          }
        }
      }
    };
    for (let i = 0; i < rects.length; i++) reinforceRect(rects[i]);

    // A single long boundary edge can only belong to one triangle. Its apex then
    // sits far from the corners and the corner gap drops under 0.5°. Sample
    // those edges before the front and back walls are united.
    const subdivideLongEdge = (side: number, rowA: number, colA: number, rowB: number, colB: number) => {
      const a = vidAt(side, rowA, colA >= cols ? 0 : colA);
      const b = vidAt(side, rowB, colB >= cols ? 0 : colB);
      const length = edgeLen(a, b);
      if (rowA === rowB) {
        const span = Math.abs(colB - colA);
        if (span <= 1) return;
        // Coarse grids already clear 0.5°. Only a fine edge that skipped its
        // samples needs extra corners, otherwise the fill adds more triangles
        // than the original grid.
        if (length <= 24 || length / span >= 1) return;
        const parts = Math.min(span, Math.ceil(length / 8));
        const step = colB > colA ? 1 : -1;
        for (let p = 1; p < parts; p++) {
          const t = Math.round((span * p) / parts);
          if (t <= 0 || t >= span) continue;
          kept[vidAt(side, rowA, colOf(colA + step * t))] = 1;
        }
        return;
      }
      const span = Math.abs(rowB - rowA);
      if (span <= 1) return;
      if (length <= 24 || length / span >= 1) return;
      const parts = Math.min(span, Math.ceil(length / 8));
      const step = rowB > rowA ? 1 : -1;
      const col = colA >= cols ? 0 : colA;
      for (let p = 1; p < parts; p++) {
        const t = Math.round((span * p) / parts);
        if (t <= 0 || t >= span) continue;
        kept[vidAt(side, rowA + step * t, col)] = 1;
      }
    };
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      subdivideLongEdge(rect.side, rect.r0, rect.c0, rect.r0, rect.c1);
      subdivideLongEdge(rect.side, rect.r0, rect.c1, rect.r1, rect.c1);
      subdivideLongEdge(rect.side, rect.r1, rect.c1, rect.r1, rect.c0);
      subdivideLongEdge(rect.side, rect.r1, rect.c0, rect.r0, rect.c0);
    }

    if (wallMode === 'rim') {
      uniteKept('row', 0);
      uniteKept('row', meshRows - 1);
    } else {
      uniteKept('row', 0);
      uniteKept('row', meshRows - 1);
      uniteKept('col', 0);
      uniteKept('col', cols - 1);
    }

    // Wall quads are the front-to-back thickness by the boundary segment.
    // A segment longer than thickness / tan(0.7°) would sit under 0.5°.
    const splitWallGaps = (kind: 'row' | 'col', index: number, wrap: boolean) => {
      const keys: number[] = [];
      const limit = kind === 'row' ? cols : meshRows;
      for (let i = 0; i < limit; i++) {
        const front = kind === 'row' ? vidAt(0, index, i) : vidAt(0, i, index);
        const back = kind === 'row' ? vidAt(1, index, i) : vidAt(1, i, index);
        if (kept[front] || kept[back]) keys.push(i);
      }
      if (wrap && keys.length > 0) keys.push(limit);
      for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        const span = b - a;
        if (span <= 1) continue;
        const fa = kind === 'row' ? vidAt(0, index, colOf(a)) : vidAt(0, a, index);
        const fb = kind === 'row' ? vidAt(0, index, colOf(b)) : vidAt(0, b, index);
        const ba = kind === 'row' ? vidAt(1, index, colOf(a)) : vidAt(1, a, index);
        const bb = kind === 'row' ? vidAt(1, index, colOf(b)) : vidAt(1, b, index);
        const along = Math.max(edgeLen(fa, fb), edgeLen(ba, bb));
        const thick = Math.max(0.4, Math.min(edgeLen(fa, ba), edgeLen(fb, bb)));
        const maxSeg = thick / STRIP_TAN;
        if (along <= maxSeg) continue;
        let parts = Math.ceil(along / maxSeg);
        if (parts > span) parts = span;
        for (let p = 1; p < parts; p++) {
          const t = a + Math.round((span * p) / parts);
          if (t <= a || t >= b || t >= limit) continue;
          if (kind === 'row') {
            kept[vidAt(0, index, t)] = 1;
            kept[vidAt(1, index, t)] = 1;
          } else {
            kept[vidAt(0, t, index)] = 1;
            kept[vidAt(1, t, index)] = 1;
          }
        }
      }
    };
    if (wallMode === 'rim') {
      splitWallGaps('row', 0, true);
      splitWallGaps('row', meshRows - 1, true);
    } else {
      splitWallGaps('row', 0, false);
      splitWallGaps('row', meshRows - 1, false);
      splitWallGaps('col', 0, false);
      splitWallGaps('col', cols - 1, false);
    }

    const newell = (loop: number[]) => {
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let i = 0; i < loop.length; i++) {
        const p = xyzOf(loop[i]);
        const q = xyzOf(loop[(i + 1) % loop.length]);
        nx += (p[1] - q[1]) * (p[2] + q[2]);
        ny += (p[2] - q[2]) * (p[0] + q[0]);
        nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      return [nx, ny, nz];
    };

    const emitStrip = (rect: Rect, loop: number[]) => {
      // A corner fan collapses when three boundary samples lie on one edge.
      // Cover every loop vertex: the wall still stitches those samples, so
      // dropping a short side opens the solid. Use a centroid when it clears
      // 0.5 degrees; otherwise inset the boundary until a centroid does.
      void rect;
      const ref0 = newell(loop);
      const dedup = (ids: number[]) => {
        const ring: number[] = [];
        for (let k = 0; k < ids.length; k++) {
          if (ring.length === 0 || ring[ring.length - 1] !== ids[k]) ring.push(ids[k]);
        }
        if (ring.length > 1 && ring[0] === ring[ring.length - 1]) ring.pop();
        return ring;
      };
      const orient = (a: number, b: number, c: number, why = '') => {
        if (a === b || b === c || a === c) return;
        const pa = xyzOf(a);
        const pb = xyzOf(b);
        const pc = xyzOf(c);
        const cx = (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]);
        const cy = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
        const cz = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
        if (cx * cx + cy * cy + cz * cz < 1e-24) return;
        // Keep the caller's edge order. The loop is already wound, and flipping
        // a gap to match the face normal walks the shared edge the same way as
        // the fan, which the manifold test rejects.
        tris.push(a, b, c);
      };
      const addPoint = (x: number, y: number, z: number, u: number, v: number, th: number) => {
        const id = N * 2 + extraX.length;
        extraX.push(x);
        extraY.push(y);
        extraZ.push(z);
        extraU.push(u);
        extraV.push(v);
        extraTh.push(th);
        return id;
      };
      const popPoint = () => {
        extraX.pop();
        extraY.pop();
        extraZ.pop();
        extraU.pop();
        extraV.pop();
        extraTh.pop();
      };
      const mean = (ring: number[]) => {
        let x = 0;
        let y = 0;
        let z = 0;
        let u = 0;
        let v = 0;
        let th = 0;
        for (let k = 0; k < ring.length; k++) {
          const pt = xyzOf(ring[k]);
          const at = attribOf(ring[k]);
          x += pt[0];
          y += pt[1];
          z += pt[2];
          u += at.u;
          v += at.v;
          th += at.th;
        }
        const inv = 1 / ring.length;
        return { x: x * inv, y: y * inv, z: z * inv, u: u * inv, v: v * inv, th: th * inv };
      };
      const centroidFan = (ring: number[]) => {
        if (ring.length < 3) return false;
        const c = mean(ring);
        const id = addPoint(c.x, c.y, c.z, c.u, c.v, c.th);
        for (let k = 0; k < ring.length; k++) {
          if (!fanOk(ring[k], ring[(k + 1) % ring.length], id)) {
            popPoint();
            return false;
          }
        }
        for (let k = 0; k < ring.length; k++) orient(ring[k], ring[(k + 1) % ring.length], id, 'centroid');
        return true;
      };
      const groupGeom = (ring: number[], start: number, edges: number, center: { x: number; y: number; z: number }, hRing: number) => {
        const n = ring.length;
        let mx = 0;
        let my = 0;
        let mz = 0;
        let mu = 0;
        let mv = 0;
        let mt = 0;
        for (let t = 0; t <= edges; t++) {
          const id = ring[(start + t) % n];
          const pt = xyzOf(id);
          const at = attribOf(id);
          mx += pt[0];
          my += pt[1];
          mz += pt[2];
          mu += at.u;
          mv += at.v;
          mt += at.th;
        }
        const inv = 1 / (edges + 1);
        mx *= inv;
        my *= inv;
        mz *= inv;
        mu *= inv;
        mv *= inv;
        mt *= inv;
        const end = xyzOf(ring[(start + edges) % n]);
        const startP = xyzOf(ring[start]);
        const ex = end[0] - startP[0];
        const ey = end[1] - startP[1];
        const ez = end[2] - startP[2];
        let ix = ey * ref0[2] - ez * ref0[1];
        let iy = ez * ref0[0] - ex * ref0[2];
        let iz = ex * ref0[1] - ey * ref0[0];
        let il = Math.hypot(ix, iy, iz);
        if (il < 1e-8) return null;
        ix /= il;
        iy /= il;
        iz /= il;
        const toward = (center.x - mx) * ix + (center.y - my) * iy + (center.z - mz) * iz;
        if (toward < 0) {
          ix = -ix;
          iy = -iy;
          iz = -iz;
        }
        il = Math.abs(toward);
        if (il < 1e-6) return null;
        const h = Math.min(hRing, il * 0.45);
        if (!(h > 1e-4)) return null;
        // Keep the apex near both ends so the gap to the next group stays above 0.5°.
        const reach = Math.min(h / Math.tan((0.9 * Math.PI) / 180), Math.max(6, h * 5));
        const id = addPoint(mx + ix * h, my + iy * h, mz + iz * h, mu, mv, mt);
        let ok = edgeLen(ring[start], id) <= reach && edgeLen(ring[(start + edges) % n], id) <= reach;
        for (let t = 0; ok && t < edges; t++) {
          if (!fanOk(ring[(start + t) % n], ring[(start + t + 1) % n], id)) ok = false;
        }
        const saved = ok
          ? { x: mx + ix * h, y: my + iy * h, z: mz + iz * h, u: mu, v: mv, th: mt }
          : null;
        popPoint();
        return saved;
      };
      const cover = (ringIn: number[], depth: number) => {
        const ring = dedup(ringIn);
        if (ring.length < 3) return;
        if (tryFan(ring)) return;
        if (centroidFan(ring)) return;
        if (depth >= 5) {
          const c = mean(ring);
          const id = addPoint(c.x, c.y, c.z, c.u, c.v, c.th);
          for (let k = 0; k < ring.length; k++) orient(ring[k], ring[(k + 1) % ring.length], id, 'depth');
          return;
        }
        const center = mean(ring);
        const n = ring.length;
        const edgeLens: number[] = [];
        for (let k = 0; k < n; k++) edgeLens.push(edgeLen(ring[k], ring[(k + 1) % n]));
        edgeLens.sort((a, b) => a - b);
        const medianEdge = edgeLens[Math.floor(edgeLens.length / 2)] || 1;
        const hRing = Math.min(4, Math.max(0.6, medianEdge * 3));
        const apices: number[] = [];
        const junctions: number[] = [];
        let start = 0;
        let spun = 0;
        while (spun < n) {
          let bestEdges = 0;
          let best: { x: number; y: number; z: number; u: number; v: number; th: number } | null = null;
          const limit = Math.min(48, n - spun);
          for (let edges = 1; edges <= limit; edges++) {
            const point = groupGeom(ring, start, edges, center, hRing);
            if (!point) break;
            bestEdges = edges;
            best = point;
          }
          if (!best) {
            const a = xyzOf(ring[start]);
            const b = xyzOf(ring[(start + 1) % n]);
            const at = attribOf(ring[start]);
            const bt = attribOf(ring[(start + 1) % n]);
            const ex = b[0] - a[0];
            const ey = b[1] - a[1];
            const ez = b[2] - a[2];
            let ix = ey * ref0[2] - ez * ref0[1];
            let iy = ez * ref0[0] - ex * ref0[2];
            let iz = ex * ref0[1] - ey * ref0[0];
            const iln = Math.hypot(ix, iy, iz) || 1;
            ix /= iln;
            iy /= iln;
            iz /= iln;
            if ((center.x - (a[0] + b[0]) / 2) * ix + (center.y - (a[1] + b[1]) / 2) * iy + (center.z - (a[2] + b[2]) / 2) * iz < 0) {
              ix = -ix;
              iy = -iy;
              iz = -iz;
            }
            const h = 1;
            best = {
              x: (a[0] + b[0]) / 2 + ix * h,
              y: (a[1] + b[1]) / 2 + iy * h,
              z: (a[2] + b[2]) / 2 + iz * h,
              u: (at.u + bt.u) / 2,
              v: (at.v + bt.v) / 2,
              th: (at.th + bt.th) / 2,
            };
            bestEdges = 1;
          }
          if (bestEdges >= n) {
            const id = addPoint(best.x, best.y, best.z, best.u, best.v, best.th);
            for (let t = 0; t < n; t++) orient(ring[t], ring[(t + 1) % n], id, 'whole');
            return;
          }
          const id = addPoint(best.x, best.y, best.z, best.u, best.v, best.th);
          for (let t = 0; t < bestEdges; t++) {
            orient(ring[(start + t) % n], ring[(start + t + 1) % n], id, 'group');
          }
          apices.push(id);
          junctions.push(ring[start]);
          start = (start + bestEdges) % n;
          spun += bestEdges;
        }
        if (apices.length < 2) return;
        for (let i = 0; i < apices.length; i++) {
          const next = (i + 1) % apices.length;
          orient(apices[i], junctions[next], apices[next], 'gap' + depth);
        }
        if (apices.length >= 3) cover(apices, depth + 1);
      };
      cover(dedup(loop), 0);
    };

    const buildLoop = (rect: Rect) => {
      const loop: number[] = [];
      appendEdge(loop, rect.side, rect.r0, rect.c0, rect.r0, rect.c1);
      appendEdge(loop, rect.side, rect.r0, rect.c1, rect.r1, rect.c1);
      appendEdge(loop, rect.side, rect.r1, rect.c1, rect.r1, rect.c0);
      appendEdge(loop, rect.side, rect.r1, rect.c0, rect.r0, rect.c0);
      if ((rect.side === 0) !== frontCcw) loop.reverse();
      return loop;
    };
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const loop = buildLoop(rect);
      if (!tryFan(loop)) emitStrip(rect, loop);
    }
    refineNeedles();

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
    // A short bed segment across a deep base is a needle if it is drawn as one
    // diagonal. A midpoint on each long side of that quad clears 0.5°.
    const splitSkinnyQuads = () => {
      const faces: Array<[number, number, number]> = [];
      for (let i = 0; i < tris.length; i += 3) faces.push([tris[i], tris[i + 1], tris[i + 2]]);
      const edgeMap = new Map<string, number[]>();
      const ekey = (a: number, b: number) => (a < b ? a + ',' + b : b + ',' + a);
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        for (let k = 0; k < 3; k++) {
          const key = ekey(f[k], f[(k + 1) % 3]);
          const list = edgeMap.get(key);
          if (list) list.push(i);
          else edgeMap.set(key, [i]);
        }
      }
      const dead = new Uint8Array(faces.length);
      const mids = new Map<string, number>();
      const mid = (a: number, b: number) => {
        const key = ekey(a, b);
        const found = mids.get(key);
        if (found !== undefined) return found;
        const pa = xyzOf(a);
        const pb = xyzOf(b);
        const aa = attribOf(a);
        const bb = attribOf(b);
        const id = N * 2 + extraX.length;
        extraX.push((pa[0] + pb[0]) / 2);
        extraY.push((pa[1] + pb[1]) / 2);
        extraZ.push((pa[2] + pb[2]) / 2);
        extraU.push((aa.u + bb.u) / 2);
        extraV.push((aa.v + bb.v) / 2);
        extraTh.push((aa.th + bb.th) / 2);
        mids.set(key, id);
        return id;
      };
      const refOf = (f: [number, number, number]): [number, number, number] => {
        const pa = xyzOf(f[0]);
        const pb = xyzOf(f[1]);
        const pc = xyzOf(f[2]);
        return [
          (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]),
          (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]),
          (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]),
        ];
      };
      const orient = (a: number, b: number, c: number, ref: [number, number, number]): [number, number, number] => {
        const pa = xyzOf(a);
        const pb = xyzOf(b);
        const pc = xyzOf(c);
        const crx = (pb[1] - pa[1]) * (pc[2] - pa[2]) - (pb[2] - pa[2]) * (pc[1] - pa[1]);
        const cry = (pb[2] - pa[2]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[2] - pa[2]);
        const crz = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
        if (crx * ref[0] + cry * ref[1] + crz * ref[2] >= 0) return [a, b, c];
        return [a, c, b];
      };
      const added: Array<[number, number, number]> = [];
      for (let i = 0; i < faces.length; i++) {
        if (dead[i]) continue;
        const f = faces[i];
        const metrics = triMetrics(f[0], f[1], f[2]);
        if (metrics.area >= MIN_TRI_AREA_MM2 && metrics.minAngle >= MIN_TRI_ANGLE) continue;
        for (let k = 0; k < 3; k++) {
          const a = f[k];
          const b = f[(k + 1) % 3];
          const users = edgeMap.get(ekey(a, b)) || [];
          if (users.length !== 2) continue;
          const j = users[0] === i ? users[1] : users[0];
          if (j < i || dead[j]) continue;
          const g = faces[j];
          const outer: Array<[number, number]> = [];
          for (let t = 0; t < 3; t++) {
            const u = f[t];
            const v = f[(t + 1) % 3];
            if (ekey(u, v) !== ekey(a, b)) outer.push([u, v]);
            const gu = g[t];
            const gv = g[(t + 1) % 3];
            if (ekey(gu, gv) !== ekey(a, b)) outer.push([gu, gv]);
          }
          const lens = outer.map(([u, v]) => ({ u, v, len: edgeLen(u, v) }));
          lens.sort((p, q) => q.len - p.len);
          if (lens.length < 4) continue;
          const short = Math.min(lens[2].len, lens[3].len);
          if (!(short > 1e-6)) continue;
          const limit = short / Math.tan((0.55 * Math.PI) / 180);
          if (lens[0].len <= limit) continue;
          if (lens[0].len > limit * 2 || lens[1].len > limit * 2) continue;
          const adj = new Map<number, number[]>();
          for (let e = 0; e < outer.length; e++) {
            const u = outer[e][0];
            const v = outer[e][1];
            if (!adj.has(u)) adj.set(u, []);
            if (!adj.has(v)) adj.set(v, []);
            adj.get(u)!.push(v);
            adj.get(v)!.push(u);
          }
          const loop = [outer[0][0]];
          let prev = -1;
          let cur = loop[0];
          for (let step = 0; step < 3; step++) {
            const nbrs = adj.get(cur) || [];
            const nxt = nbrs[0] === prev ? nbrs[1] : nbrs[0];
            loop.push(nxt);
            prev = cur;
            cur = nxt;
          }
          let rot = 0;
          while (rot < 4 && edgeLen(loop[0], loop[1]) > limit) {
            loop.push(loop.shift()!);
            rot++;
          }
          if (edgeLen(loop[0], loop[1]) > limit) continue;
          const A = loop[0];
          const B = loop[1];
          const C = loop[2];
          const D = loop[3];
          const extraBefore = extraX.length;
          const mBC = mid(B, C);
          const mDA = mid(D, A);
          const ref = refOf(f);
          const kids: Array<[number, number, number]> = [
            orient(A, B, mBC, ref),
            orient(A, mBC, mDA, ref),
            orient(mDA, mBC, C, ref),
            orient(mDA, C, D, ref),
          ];
          let ok = true;
          let areaSum = 0;
          const quadArea = metrics.area + triMetrics(g[0], g[1], g[2]).area;
          for (let t = 0; t < kids.length; t++) {
            const km = triMetrics(kids[t][0], kids[t][1], kids[t][2]);
            areaSum += km.area;
            if (km.area < 1e-8 || km.minAngle < MIN_TRI_ANGLE) ok = false;
          }
          if (!ok || Math.abs(areaSum - quadArea) > quadArea * 0.05 + 1e-4) {
            const stale: string[] = [];
            for (const [key, id] of mids) {
              if (id >= N * 2 + extraBefore) stale.push(key);
            }
            for (let s = 0; s < stale.length; s++) mids.delete(stale[s]);
            extraX.length = extraBefore;
            extraY.length = extraBefore;
            extraZ.length = extraBefore;
            extraU.length = extraBefore;
            extraV.length = extraBefore;
            extraTh.length = extraBefore;
            continue;
          }
          dead[i] = 1;
          dead[j] = 1;
          for (let t = 0; t < kids.length; t++) added.push(kids[t]);
          break;
        }
      }
      for (let i = 0; i < faces.length; i++) {
        if (dead[i]) continue;
        const face = faces[i];
        for (let k = 0; k < 3; k++) {
          const u = face[k];
          const v = face[(k + 1) % 3];
          const m = mids.get(ekey(u, v));
          if (m === undefined) continue;
          const opp = face[(k + 2) % 3];
          const rf = refOf(face);
          added.push(orient(u, m, opp, rf));
          added.push(orient(m, v, opp, rf));
          dead[i] = 1;
          break;
        }
      }
      tris.length = 0;
      for (let i = 0; i < faces.length; i++) {
        if (dead[i]) continue;
        tris.push(faces[i][0], faces[i][1], faces[i][2]);
      }
      for (let i = 0; i < added.length; i++) tris.push(added[i][0], added[i][1], added[i][2]);
    };
    splitSkinnyQuads();

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
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      // Accumulate
      normals[i0] += nx;
      normals[i0 + 1] += ny;
      normals[i0 + 2] += nz;

      normals[i1] += nx;
      normals[i1 + 1] += ny;
      normals[i1 + 2] += nz;

      normals[i2] += nx;
      normals[i2 + 1] += ny;
      normals[i2 + 2] += nz;
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
