import { LithophaneSettings, MeshGeometryData } from '../types/lithophane';

/**
 * Height and dimensional parameters for the lampshade base.
 * Designed for structural stability, minimum filament usage (~12-18g),
 * and clean printability with no supports needed.
 */
export const BASE_FLOOR_HEIGHT_MM = 2.0; // 2mm floor thickness (combined with 2mm lithophane bottom edge = 4mm total)
export const BASE_LIP_HEIGHT_MM = 4.0; // Rises above floor to Z = 6.0mm
export const BASE_TOTAL_HEIGHT_MM = BASE_FLOOR_HEIGHT_MM + BASE_LIP_HEIGHT_MM;
export const BASE_LIP_CLEARANCE_MM = 0.4; // Radial tolerance so lithophane slides on smoothly
export const BASE_LIP_WALL_THICKNESS_MM = 1.8; // Sturdy 4-perimeter wall
export const BASE_RESTING_SHELF_OVERHANG_MM = 3.4; // Default rim extension matching default lithophane frame thickness
export const BASE_RIM_THICKNESS_MM = 3.4;
export const BASE_LIGHT_HOLE_RADIUS_MM = 20.0; // 40mm diameter standard hole for LED tea light / puck / socket
export const BASE_LIGHT_HOLE_DIA_MM = BASE_LIGHT_HOLE_RADIUS_MM * 2;

/**
 * Calculates the exact wall thickness of the lithophane's bottom rim.
 * When frame is enabled, the bottom rim is defined by frameThickness (default 3.4mm).
 * When frame is disabled, the bottom rim provides a solid structural seating rim matching maxThickness.
 * Both the lithophane mesh generator and the base generator use this exact same
 * calculation so that the base outer diameter matches the lithophane width perfectly.
 */
export function getHollowBottomRimThickness(settings: LithophaneSettings): number {
  const minTh = Math.max(0.4, settings.minThickness);
  const maxTh = Math.max(minTh + 0.2, settings.maxThickness);
  if (settings.hasFrame) {
    return Math.max(minTh, settings.frameThickness || maxTh);
  }
  return Math.max(2.0, settings.frameThickness || maxTh);
}

export class BaseGenerator {
  /**
   * Identifies whether a shape is a hollow style lithophane requiring a matching base.
   */
  static isHollowShape(shape: string): boolean {
    return shape === 'cylinder' || shape === 'cube' || shape === 'hexagon';
  }

  /**
   * Generates a watertight, 2-manifold solid lampshade base for hollow lithophane shapes:
   * 'cylinder' (round), 'cube' (square), or 'hexagon' (6-sided).
   *
   * Features:
   * - Flat bed contact at Z = 0 (prints cleanly without supports)
   * - Stepped horizontal resting shelf at Z = 2.0mm where the lithophane sits
   * - Raised locating lip (Z = 2.0mm to 6.0mm) that fits inside the lithophane bore snugly
   * - Central adjustable through-hole for LED puck, tea light candle, or lamp cord passage
   * - Outer perimeter that perfectly matches the lithophane bottom rim flush vertically
   */
  static generateBase(settings: LithophaneSettings): MeshGeometryData {
    const shape = settings.shape;
    const isCube = shape === 'cube';
    const isHexagon = shape === 'hexagon';
    const isCylinder = shape === 'cylinder';

    if (!isCube && !isHexagon && !isCylinder) {
      throw new Error(`Lamp base is only supported for hollow shapes (cylinder, cube, hexagon). Received: ${shape}`);
    }

    // Determine internal bore radius / half-width / apothem
    let rIn = 45.0; // default 90mm diameter cylinder
    if (isCube) {
      const cubeW = Math.max(30, settings.cubeWidth || 90);
      rIn = cubeW / 2;
    } else if (isHexagon) {
      const hexD = Math.max(40, settings.hexagonDiameter || 90);
      rIn = (hexD / 2) * (Math.sqrt(3) / 2);
    } else {
      const cylD = Math.max(40, settings.cylinderDiameter || 90);
      rIn = cylD / 2;
    }

    const rLipOut = rIn - BASE_LIP_CLEARANCE_MM;
    const userHoleDia = settings.lightHoleDiameter !== undefined ? settings.lightHoleDiameter : BASE_LIGHT_HOLE_DIA_MM;
    const requestedHoleR = Math.max(8.0, userHoleDia / 2);
    const rLipIn = Math.max(requestedHoleR + 3.0, rLipOut - BASE_LIP_WALL_THICKNESS_MM);
    const rimThickness = getHollowBottomRimThickness(settings);
    const rOuter = rIn + rimThickness;
    const rHole = Math.min(requestedHoleR, Math.max(8.0, rLipIn - 3.0));

    const zFloor = BASE_FLOOR_HEIGHT_MM;
    const zLip = BASE_TOTAL_HEIGHT_MM;

    // 8 points in profile [r, z]
    // P0: (rHole, 0)
    // P1: (rHole, zFloor)
    // P2: (rLipIn, zFloor)
    // P3: (rLipIn, zLip)
    // P4: (rLipOut, zLip)
    // P5: (rLipOut, zFloor)
    // P6: (rOuter, zFloor)
    // P7: (rOuter, 0)
    const zProfile = [0, zFloor, zFloor, zLip, zLip, zFloor, zFloor, 0];
    const numProfilePoints = 8;

    // Angular subdivision count: 72 is divisible by 4 (cube) and 6 (hexagon), ensuring sharp corners
    const N = 72;
    const numVertices = N * numProfilePoints;
    const numTriangles = N * numProfilePoints * 2;

    const vertices = new Float32Array(numVertices * 3);
    const normals = new Float32Array(numVertices * 3);
    const indices = new Uint32Array(numTriangles * 3);

    const hexSector = Math.PI / 3;
    const hexHalfSector = hexSector / 2;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    // Helper functions for radial distance at angle theta
    const getSquareR = (w: number, cosT: number, sinT: number): number => {
      const denom = Math.max(Math.abs(cosT), Math.abs(sinT));
      return denom > 1e-6 ? w / denom : w;
    };

    const getHexR = (apothem: number, theta: number): number => {
      const angleInSector = (((theta % hexSector) + hexSector) % hexSector) - hexHalfSector;
      const cosA = Math.cos(angleInSector);
      return cosA > 1e-6 ? apothem / cosA : apothem;
    };

    // 1. Generate vertices
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * 2 * Math.PI;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let rProfile: number[];
      if (isCube) {
        rProfile = [
          rHole,
          rHole,
          getSquareR(rLipIn, cosT, sinT),
          getSquareR(rLipIn, cosT, sinT),
          getSquareR(rLipOut, cosT, sinT),
          getSquareR(rLipOut, cosT, sinT),
          getSquareR(rOuter, cosT, sinT),
          getSquareR(rOuter, cosT, sinT),
        ];
      } else if (isHexagon) {
        rProfile = [
          rHole,
          rHole,
          getHexR(rLipIn, theta),
          getHexR(rLipIn, theta),
          getHexR(rLipOut, theta),
          getHexR(rLipOut, theta),
          getHexR(rOuter, theta),
          getHexR(rOuter, theta),
        ];
      } else {
        rProfile = [
          rHole,
          rHole,
          rLipIn,
          rLipIn,
          rLipOut,
          rLipOut,
          rOuter,
          rOuter,
        ];
      }

      for (let k = 0; k < numProfilePoints; k++) {
        const vIdx = (i * numProfilePoints + k) * 3;
        const x = rProfile[k] * cosT;
        const y = rProfile[k] * sinT;
        const z = zProfile[k];

        vertices[vIdx] = x;
        vertices[vIdx + 1] = y;
        vertices[vIdx + 2] = z;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    // 2. Generate triangles with strictly consistent outward winding
    let triPtr = 0;
    for (let i = 0; i < N; i++) {
      const nextI = (i + 1) % N;
      for (let k = 0; k < numProfilePoints; k++) {
        const nextK = (k + 1) % numProfilePoints;

        const va = i * numProfilePoints + k;
        const vb = nextI * numProfilePoints + k;
        const vc = nextI * numProfilePoints + nextK;
        const vd = i * numProfilePoints + nextK;

        // Tri 1: (va, vd, vb)
        indices[triPtr++] = va;
        indices[triPtr++] = vd;
        indices[triPtr++] = vb;

        // Tri 2: (vb, vd, vc)
        indices[triPtr++] = vb;
        indices[triPtr++] = vd;
        indices[triPtr++] = vc;
      }
    }

    // 3. Compute vertex normals
    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t] * 3;
      const ib = indices[t + 1] * 3;
      const ic = indices[t + 2] * 3;

      const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
      const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
      const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      normals[ia] += nx;
      normals[ia + 1] += ny;
      normals[ia + 2] += nz;

      normals[ib] += nx;
      normals[ib + 1] += ny;
      normals[ib + 2] += nz;

      normals[ic] += nx;
      normals[ic + 1] += ny;
      normals[ic + 2] += nz;
    }

    for (let v = 0; v < numVertices; v++) {
      const vIdx = v * 3;
      const nx = normals[vIdx];
      const ny = normals[vIdx + 1];
      const nz = normals[vIdx + 2];
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-8) {
        normals[vIdx] = nx / len;
        normals[vIdx + 1] = ny / len;
        normals[vIdx + 2] = nz / len;
      }
    }

    const thicknesses = new Float32Array(numVertices);
    thicknesses.fill(BASE_LIP_WALL_THICKNESS_MM);

    return {
      vertices,
      indices,
      normals,
      thicknesses,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ],
      },
      gridResolution: {
        cols: N,
        rows: numProfilePoints,
      },
    };
  }
}

