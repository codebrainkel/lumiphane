import { MeshGeometryData, MeshValidationResult } from '../types/lithophane';

const THICKNESS_CELL_MM = 2;
const THICKNESS_SAMPLE_MM = 1.5;

/**
 * Wall thickness from the mesh itself. One inward ray per sample cell, from the
 * largest triangle in that cell. Hits shorter than 0.05 mm are self-intersections.
 * Hits longer than the smallest bounding-box side are spans across the part
 * (panel width, bore, or height), not a wall. A tall vertical wall also has
 * horizontal caps; a ray between those caps is the part height and is dropped.
 */
function measureWallThickness(geometry: MeshGeometryData): { min: number; max: number } {
  const { vertices, indices, boundingBox } = geometry;
  const triangleCount = indices.length / 3;
  if (triangleCount === 0 || vertices.length < 9) return { min: 0, max: 0 };

  const sizeX = boundingBox.size[0];
  const sizeY = boundingBox.size[1];
  const sizeZ = boundingBox.size[2];
  const minSide = Math.max(0.2, Math.min(sizeX, sizeY, sizeZ));
  const maxHit = minSide * 1.02;

  const ax = new Float64Array(triangleCount);
  const ay = new Float64Array(triangleCount);
  const az = new Float64Array(triangleCount);
  const bx = new Float64Array(triangleCount);
  const by = new Float64Array(triangleCount);
  const bz = new Float64Array(triangleCount);
  const cx = new Float64Array(triangleCount);
  const cy = new Float64Array(triangleCount);
  const cz = new Float64Array(triangleCount);
  const nx = new Float64Array(triangleCount);
  const ny = new Float64Array(triangleCount);
  const nz = new Float64Array(triangleCount);
  const alive = new Uint8Array(triangleCount);

  const bins = new Map<bigint, number[]>();
  const samples = new Map<bigint, number>();
  const sampleArea = new Map<bigint, number>();

  const pack = (ix: number, iy: number, iz: number) =>
    (BigInt(ix + 1048576) << 42n) | (BigInt(iy + 1048576) << 21n) | BigInt(iz + 1048576);

  for (let i = 0; i < triangleCount; i++) {
    const ia = indices[i * 3] * 3;
    const ib = indices[i * 3 + 1] * 3;
    const ic = indices[i * 3 + 2] * 3;
    if (ia < 0 || ib < 0 || ic < 0 || ia >= vertices.length || ib >= vertices.length || ic >= vertices.length) continue;
    const x0 = vertices[ia];
    const y0 = vertices[ia + 1];
    const z0 = vertices[ia + 2];
    const x1 = vertices[ib];
    const y1 = vertices[ib + 1];
    const z1 = vertices[ib + 2];
    const x2 = vertices[ic];
    const y2 = vertices[ic + 1];
    const z2 = vertices[ic + 2];
    if (![x0, y0, z0, x1, y1, z1, x2, y2, z2].every(Number.isFinite)) continue;
    const abx = x1 - x0;
    const aby = y1 - y0;
    const abz = z1 - z0;
    const acx = x2 - x0;
    const acy = y2 - y0;
    const acz = z2 - z0;
    let cpx = aby * acz - abz * acy;
    let cpy = abz * acx - abx * acz;
    let cpz = abx * acy - aby * acx;
    const len = Math.hypot(cpx, cpy, cpz);
    if (len < 1e-10) continue;
    cpx /= len;
    cpy /= len;
    cpz /= len;
    ax[i] = x0;
    ay[i] = y0;
    az[i] = z0;
    bx[i] = x1;
    by[i] = y1;
    bz[i] = z1;
    cx[i] = x2;
    cy[i] = y2;
    cz[i] = z2;
    nx[i] = cpx;
    ny[i] = cpy;
    nz[i] = cpz;
    alive[i] = 1;

    const minx = Math.min(x0, x1, x2);
    const miny = Math.min(y0, y1, y2);
    const minz = Math.min(z0, z1, z2);
    const maxx = Math.max(x0, x1, x2);
    const maxy = Math.max(y0, y1, y2);
    const maxz = Math.max(z0, z1, z2);
    const ix0 = Math.floor(minx / THICKNESS_CELL_MM);
    const iy0 = Math.floor(miny / THICKNESS_CELL_MM);
    const iz0 = Math.floor(minz / THICKNESS_CELL_MM);
    const ix1 = Math.floor(maxx / THICKNESS_CELL_MM);
    const iy1 = Math.floor(maxy / THICKNESS_CELL_MM);
    const iz1 = Math.floor(maxz / THICKNESS_CELL_MM);
    const span = (ix1 - ix0 + 1) * (iy1 - iy0 + 1) * (iz1 - iz0 + 1);
    if (span > 0 && span <= 4096) {
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let iy = iy0; iy <= iy1; iy++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            const key = pack(ix, iy, iz);
            const bucket = bins.get(key);
            if (bucket) bucket.push(i);
            else bins.set(key, [i]);
          }
        }
      }
    } else {
      const key = pack(
        Math.floor((minx + maxx) / (2 * THICKNESS_CELL_MM)),
        Math.floor((miny + maxy) / (2 * THICKNESS_CELL_MM)),
        Math.floor((minz + maxz) / (2 * THICKNESS_CELL_MM)),
      );
      const bucket = bins.get(key);
      if (bucket) bucket.push(i);
      else bins.set(key, [i]);
    }

    const area = len * 0.5;
    const sx = Math.floor((x0 + x1 + x2) / (3 * THICKNESS_SAMPLE_MM));
    const sy = Math.floor((y0 + y1 + y2) / (3 * THICKNESS_SAMPLE_MM));
    const sz = Math.floor((z0 + z1 + z2) / (3 * THICKNESS_SAMPLE_MM));
    const sKey = pack(sx, sy, sz);
    const prev = sampleArea.get(sKey);
    if (prev === undefined || area > prev) {
      sampleArea.set(sKey, area);
      samples.set(sKey, i);
    }
  }

  const hits: number[] = [];

  const intersect = (tri: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number => {
    const x0 = ax[tri];
    const y0 = ay[tri];
    const z0 = az[tri];
    const abx = bx[tri] - x0;
    const aby = by[tri] - y0;
    const abz = bz[tri] - z0;
    const acx = cx[tri] - x0;
    const acy = cy[tri] - y0;
    const acz = cz[tri] - z0;
    const px = dy * acz - dz * acy;
    const py = dz * acx - dx * acz;
    const pz = dx * acy - dy * acx;
    const det = abx * px + aby * py + abz * pz;
    if (det > -1e-10 && det < 1e-10) return Infinity;
    const inv = 1 / det;
    const tx = ox - x0;
    const ty = oy - y0;
    const tz = oz - z0;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0.02 || u > 0.98) return Infinity;
    const qx = ty * abz - tz * aby;
    const qy = tz * abx - tx * abz;
    const qz = tx * aby - ty * abx;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0.02 || u + v > 0.98) return Infinity;
    const t = (acx * qx + acy * qy + acz * qz) * inv;
    // Longer than a stand flange is a hollow span (bore, face-to-face), not a wall.
    if (t < 0.05 || t > Math.min(maxHit, 30)) return Infinity;
    // The far side of a wall faces back toward an inward ray, so the dot product is positive.
    if (nx[tri] * dx + ny[tri] * dy + nz[tri] * dz < 0.3) return Infinity;
    return t;
  };

  for (const tri of samples.values()) {
    if (!alive[tri]) continue;
    const ox = (ax[tri] + bx[tri] + cx[tri]) / 3;
    const oy = (ay[tri] + by[tri] + cy[tri]) / 3;
    const oz = (az[tri] + bz[tri] + cz[tri]) / 3;
    const dx = -nx[tri];
    const dy = -ny[tri];
    const dz = -nz[tri];
    const sourceNz = nz[tri];

    let ix = Math.floor(ox / THICKNESS_CELL_MM);
    let iy = Math.floor(oy / THICKNESS_CELL_MM);
    let iz = Math.floor(oz / THICKNESS_CELL_MM);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = stepX === 0 ? Infinity : (THICKNESS_CELL_MM * stepX) / dx;
    const tDeltaY = stepY === 0 ? Infinity : (THICKNESS_CELL_MM * stepY) / dy;
    const tDeltaZ = stepZ === 0 ? Infinity : (THICKNESS_CELL_MM * stepZ) / dz;
    const boundary = (i: number, origin: number, dir: number, step: number) => {
      if (step === 0) return Infinity;
      const edge = (step > 0 ? i + 1 : i) * THICKNESS_CELL_MM;
      return (edge - origin) / dir;
    };
    let tMaxX = boundary(ix, ox, dx, stepX);
    let tMaxY = boundary(iy, oy, dy, stepY);
    let tMaxZ = boundary(iz, oz, dz, stepZ);
    let traveled = 0;
    for (let steps = 0; steps < 512 && traveled <= maxHit; steps++) {
      const bucket = bins.get(pack(ix, iy, iz));
      const cellExit = Math.min(tMaxX, tMaxY, tMaxZ);
      let bestT = Infinity;
      if (bucket) {
        for (let k = 0; k < bucket.length; k++) {
          const other = bucket[k];
          if (other === tri || !alive[other]) continue;
          const t = intersect(other, ox, oy, oz, dx, dy, dz);
          if (t > cellExit + 1e-4) continue;
          const capChord = Math.abs(sourceNz) > 0.85 && Math.abs(nz[other]) > 0.85 && t > 8;
          if (capChord) continue;
          if (t < bestT) bestT = t;
        }
      }
      if (bestT < Infinity) {
        hits.push(bestT);
        break;
      }
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        if (!Number.isFinite(tMaxX)) break;
        traveled = tMaxX;
        ix += stepX;
        tMaxX += tDeltaX;
      } else if (tMaxY <= tMaxZ) {
        if (!Number.isFinite(tMaxY)) break;
        traveled = tMaxY;
        iy += stepY;
        tMaxY += tDeltaY;
      } else {
        if (!Number.isFinite(tMaxZ)) break;
        traveled = tMaxZ;
        iz += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
  }

  if (hits.length === 0) return { min: 0, max: 0 };
  hits.sort((a, b) => a - b);
  // Grazing rays at flanges and corners report a short chord. Keep them only
  // when they are most of the samples, which is a genuinely thin wall.
  const solid = hits.filter((hit) => hit >= 0.55);
  const use = solid.length >= hits.length * 0.5 ? solid : hits;
  if (use.length >= 20) {
    const lo = Math.floor((use.length - 1) * 0.01);
    const hi = Math.min(use.length - 1, Math.ceil((use.length - 1) * 0.99));
    return { min: use[lo], max: use[hi] };
  }
  let min = use[0];
  let max = use[use.length - 1];
  if (hits.length >= 6) {
    for (let i = 0; i < hits.length - 2; i++) {
      if (hits[i + 2] - hits[i] <= 0.3) {
        min = hits[i];
        break;
      }
    }
    for (let i = hits.length - 1; i >= 2; i--) {
      if (hits[i] - hits[i - 2] <= 0.3) {
        max = hits[i];
        break;
      }
    }
  }
  return { min, max };
}

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
    let nonFiniteVertexCount = 0;
    for (let v = 0; v < vertexCount; v++) {
      const x = vertices[v * 3];
      const y = vertices[v * 3 + 1];
      const z = vertices[v * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nonFiniteVertexCount++;
    }

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

    const measured = measureWallThickness(geometry);
    minThick = measured.min;
    maxThick = measured.max;
    if (!Number.isFinite(minThick)) minThick = 0;
    if (!Number.isFinite(maxThick)) maxThick = 0;

    // Convert Volume from mm^3 to cm^3
    const volumeCm3 = Math.max(0, Math.abs(signedVolumeMm3) / 1000.0);
    // Standard PLA filament density ~1.24 g/cm3
    const estimatedWeightGrams = Math.round(volumeCm3 * 1.24 * 10) / 10;

    if (minThick < 0.6) {
      warnings.push(`Minimum thickness (${minThick.toFixed(2)}mm) is thin. Recommended >= 0.6mm to prevent light blowouts or pinholes.`);
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
      isValid: isManifold && degenerateTriangles === 0,
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
      nonFiniteVertexCount,
      openBoundaryEdges,
      nonManifoldEdges,
      degenerateTriangles,
      warnings,
      eulerCharacteristic,
    };
  }
}
