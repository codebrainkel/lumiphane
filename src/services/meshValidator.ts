import { MeshGeometryData, MeshValidationResult } from '../types/lithophane';

export class MeshValidator {
  /**
   * Validates a 3D mesh for FDM printability, watertightness, 2-manifold topology,
   * triangle winding consistency, and computes physical metrics.
   */
  static validate(geometry: MeshGeometryData): MeshValidationResult {
    const { vertices, indices, boundingBox } = geometry;
    const vertexCount = vertices.length / 3;
    const triangleCount = indices.length / 3;

    const warnings: string[] = [];
    let degenerateTriangles = 0;

    // 1. Edge arrays for topology & manifold validation
    // Fast numeric 64-bit integer keys: (min << 32) | max, zero heap string allocations
    const numEdges = triangleCount * 3;
    const undirectedEdges = new BigInt64Array(numEdges);
    const directedEdges = new BigInt64Array(numEdges);
    let edgePtr = 0;

    // Compute signed volume via divergence theorem: Vol = 1/6 * sum(A . (B x C))
    let signedVolumeMm3 = 0;

    let minThick = Infinity;
    let maxThick = -Infinity;

    for (let i = 0; i < triangleCount; i++) {
      const idxA = indices[i * 3];
      const idxB = indices[i * 3 + 1];
      const idxC = indices[i * 3 + 2];

      // Check bounds
      if (idxA >= vertexCount || idxB >= vertexCount || idxC >= vertexCount) {
        warnings.push(`Triangle ${i} references invalid vertex indices`);
        continue;
      }

      // Check degenerate triangle (identical vertices)
      if (idxA === idxB || idxB === idxC || idxC === idxA) {
        degenerateTriangles++;
        continue;
      }

      const ax = vertices[idxA * 3], ay = vertices[idxA * 3 + 1], az = vertices[idxA * 3 + 2];
      const bx = vertices[idxB * 3], by = vertices[idxB * 3 + 1], bz = vertices[idxB * 3 + 2];
      const cx = vertices[idxC * 3], cy = vertices[idxC * 3 + 1], cz = vertices[idxC * 3 + 2];

      // Edge vectors
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      // Cross product
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;

      const areaSq = crossX * crossX + crossY * crossY + crossZ * crossZ;
      if (areaSq < 1e-12) {
        degenerateTriangles++;
      }

      // Divergence theorem contribution
      signedVolumeMm3 += (ax * crossX + ay * crossY + az * crossZ) / 6.0;

      // Register undirected and directed edges
      const triEdges = [
        [idxA, idxB],
        [idxB, idxC],
        [idxC, idxA],
      ];

      for (let k = 0; k < 3; k++) {
        const v0 = triEdges[k][0];
        const v1 = triEdges[k][1];
        const minV = v0 < v1 ? v0 : v1;
        const maxV = v0 < v1 ? v1 : v0;
        undirectedEdges[edgePtr] = (BigInt(minV) << 32n) | BigInt(maxV);
        directedEdges[edgePtr] = (BigInt(v0) << 32n) | BigInt(v1);
        edgePtr++;
      }
    }

    // 2. High-speed Topology & Manifold Check via sorted edge buffers
    const activeUndirected = edgePtr === numEdges ? undirectedEdges : undirectedEdges.subarray(0, edgePtr);
    const activeDirected = edgePtr === numEdges ? directedEdges : directedEdges.subarray(0, edgePtr);
    activeUndirected.sort();
    activeDirected.sort();

    let openBoundaryEdges = 0;
    let nonManifoldEdges = 0;
    let uniqueEdgesCount = 0;

    let eIdx = 0;
    const totalActiveEdges = activeUndirected.length;
    while (eIdx < totalActiveEdges) {
      let nextIdx = eIdx + 1;
      while (nextIdx < totalActiveEdges && activeUndirected[nextIdx] === activeUndirected[eIdx]) {
        nextIdx++;
      }
      const count = nextIdx - eIdx;
      uniqueEdgesCount++;
      if (count === 1) {
        openBoundaryEdges++;
      } else if (count > 2) {
        nonManifoldEdges++;
      }
      eIdx = nextIdx;
    }

    // Check half-edge winding consistency
    let windingViolations = 0;
    for (let k = 0; k < totalActiveEdges - 1; k++) {
      if (activeDirected[k] === activeDirected[k + 1]) {
        windingViolations++;
      }
    }

    // Euler Characteristic: V - E + F
    const eulerCharacteristic = vertexCount - uniqueEdgesCount + triangleCount;

    const isWatertight = openBoundaryEdges === 0 && nonManifoldEdges === 0;
    const isManifold = isWatertight && windingViolations === 0;

    // Vertex-pair distance is the straight line between the stored front and back
    // samples. A slanted offset (the old concave arc) keeps that line long while
    // the real wall, measured along the surface normal, collapses.
    const halfN = vertexCount / 2;
    let minPair = Infinity;
    let maxPair = -Infinity;
    for (let i = 0; i < halfN; i++) {
      const fx = vertices[i * 3], fy = vertices[i * 3 + 1], fz = vertices[i * 3 + 2];
      const bx = vertices[(halfN + i) * 3], by = vertices[(halfN + i) * 3 + 1], bz = vertices[(halfN + i) * 3 + 2];
      const dist = Math.sqrt((fx - bx) ** 2 + (fy - by) ** 2 + (fz - bz) ** 2);
      if (dist < minPair) minPair = dist;
      if (dist > maxPair) maxPair = dist;
    }

    const wall = this.measureWall(vertices, geometry.gridResolution?.cols ?? 0, geometry.gridResolution?.rows ?? 0, vertexCount);
    minThick = wall.samples > 0 && Number.isFinite(wall.minNormal) ? Math.min(minPair, wall.minNormal) : minPair;
    maxThick = Number.isFinite(maxPair) ? maxPair : wall.maxNormal;
    const crossed = wall.crossed;
    const slanted = wall.samples > 0 && wall.minNormal < 0.4 && wall.minNormal < minPair * 0.6;

    // Convert Volume from mm^3 to cm^3
    const volumeCm3 = Math.max(0, Math.abs(signedVolumeMm3) / 1000.0);
    // Standard PLA filament density ~1.24 g/cm3
    const estimatedWeightGrams = Math.round(volumeCm3 * 1.24 * 10) / 10;

    const minShown = Math.round(minThick * 100) / 100;
    if (minShown < 0.6) {
      warnings.push(`Minimum thickness (${minShown.toFixed(2)}mm) is thin. Recommended >= 0.6mm to prevent light blowouts or pinholes.`);
    }

    if (crossed > 0) {
      warnings.push(`Wall folds through itself at ${crossed} samples. The mesh is self-intersecting.`);
    }

    if (slanted) {
      warnings.push(`Wall thickness collapses along the surface (${wall.minNormal.toFixed(2)}mm versus ${minPair.toFixed(2)}mm between paired vertices).`);
    }

    if (degenerateTriangles > 0) {
      warnings.push(`${degenerateTriangles} degenerate micro-triangles detected.`);
    }

    if (!isWatertight) {
      warnings.push(`Mesh is not closed: ${openBoundaryEdges} boundary edges, ${nonManifoldEdges} non-manifold edges.`);
    }

    if (windingViolations > 0) {
      warnings.push(`${windingViolations} triangle winding mismatches detected.`);
    }

    const isStanding = (boundingBox.min[2] >= -0.01 && boundingBox.size[2] > 10) || (boundingBox.size[2] > boundingBox.size[1]);
    const widthMm = Math.round(boundingBox.size[0] * 100) / 100;
    const heightMm = Math.round((isStanding ? boundingBox.size[2] : boundingBox.size[1]) * 100) / 100;
    const depthMm = Math.round((isStanding ? boundingBox.size[1] : boundingBox.size[2]) * 100) / 100;

    return {
      isValid: isManifold && degenerateTriangles === 0 && crossed === 0 && !slanted,
      isWatertight,
      isManifold,
      vertexCount,
      triangleCount,
      edgeCount: uniqueEdgesCount,
      volumeCm3: Math.round(volumeCm3 * 100) / 100,
      estimatedWeightGrams,
      dimensionsMm: {
        width: widthMm,
        height: heightMm,
        depth: depthMm,
      },
      minThicknessDetected: Math.round(minThick * 100) / 100,
      maxThicknessDetected: Math.round(maxThick * 100) / 100,
      degenerateTriangles,
      warnings,
      eulerCharacteristic,
    };
  }

  /**
   * Thickness along the back-face normal for wall samples (paired distance under 6 mm).
   * Feet are thicker than that and are ignored, so a wide border footing is not
   * mistaken for a folded photograph.
   */
  private static measureWall(
    vertices: Float32Array,
    cols: number,
    rows: number,
    vertexCount: number
  ): { minNormal: number; maxNormal: number; crossed: number; samples: number } {
    const empty = { minNormal: Infinity, maxNormal: -Infinity, crossed: 0, samples: 0 };
    if (cols < 3 || rows < 3 || cols * rows * 2 !== vertexCount) return empty;

    const N = cols * rows;
    const enclosed = this.looksEnclosed(vertices, cols, rows);
    const refC = enclosed ? Math.min(cols - 2, Math.max(1, Math.floor(cols / 8))) : Math.floor(cols / 2);
    const ref = this.signedWall(vertices, cols, rows, N, Math.floor(rows / 2), refC, enclosed);
    const orient = ref.signed < 0 ? -1 : 1;

    let minNormal = Infinity;
    let maxNormal = -Infinity;
    let crossed = 0;
    let samples = 0;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const sample = this.signedWall(vertices, cols, rows, N, r, c, enclosed);
        if (!Number.isFinite(sample.signed) || sample.pair > 6) continue;
        const signed = orient * sample.signed;
        samples++;
        if (signed < -0.12) {
          crossed++;
          continue;
        }
        const thick = Math.max(0, signed);
        if (thick < minNormal) minNormal = thick;
        if (thick > maxNormal) maxNormal = thick;
      }
    }
    if (samples === 0) return empty;
    return { minNormal, maxNormal, crossed, samples };
  }

  /** A tube or cube closes in X, so the first and last columns sit next to each other. */
  private static looksEnclosed(vertices: Float32Array, cols: number, rows: number): boolean {
    const N = cols * rows;
    const mid = Math.floor(rows / 2) * cols;
    const ax = vertices[(N + mid) * 3];
    const ay = vertices[(N + mid) * 3 + 1];
    const bx = vertices[(N + mid + cols - 1) * 3];
    const by = vertices[(N + mid + cols - 1) * 3 + 1];
    const span = Math.hypot(
      vertices[(N + mid + Math.floor(cols / 2)) * 3] - ax,
      vertices[(N + mid + Math.floor(cols / 2)) * 3 + 1] - ay
    );
    const seam = Math.hypot(ax - bx, ay - by);
    return span > 1 && seam < span * 0.2;
  }

  /** Signed normal thickness and the straight front-to-back distance at one grid sample. */
  private static signedWall(
    vertices: Float32Array,
    cols: number,
    rows: number,
    N: number,
    r: number,
    c: number,
    enclosed: boolean
  ): { signed: number; pair: number } {
    const miss = { signed: NaN, pair: Infinity };
    const c0 = enclosed ? (c - 1 + cols) % cols : c - 1;
    const c1 = enclosed ? (c + 1) % cols : c + 1;
    if (!enclosed && (c0 < 0 || c1 >= cols || r <= 0 || r >= rows - 1)) return miss;
    const at = (rr: number, cc: number, back: boolean) => {
      const i = ((back ? N : 0) + rr * cols + cc) * 3;
      return [vertices[i], vertices[i + 1], vertices[i + 2]];
    };
    const [bx, by, bz] = at(r, c, true);
    const [lx, ly, lz] = at(r, c0, true);
    const [rx, ry, rz] = at(r, c1, true);
    const [ux, uy, uz] = at(r - 1, c, true);
    const [dx, dy, dz] = at(r + 1, c, true);
    const tx = rx - lx;
    const ty = ry - ly;
    const tz = rz - lz;
    const vx = dx - ux;
    const vy = dy - uy;
    const vz = dz - uz;
    let nx = ty * vz - tz * vy;
    let ny = tz * vx - tx * vz;
    let nz = tx * vy - ty * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) return miss;
    nx /= len;
    ny /= len;
    nz /= len;
    const [fx, fy, fz] = at(r, c, false);
    const ox = fx - bx;
    const oy = fy - by;
    const oz = fz - bz;
    return {
      signed: ox * nx + oy * ny + oz * nz,
      pair: Math.hypot(ox, oy, oz),
    };
  }
}
