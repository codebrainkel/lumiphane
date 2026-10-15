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

    // Detect actual thicknesses between corresponding front and back vertices
    const halfN = vertexCount / 2;
    for (let i = 0; i < halfN; i++) {
      const fx = vertices[i * 3], fy = vertices[i * 3 + 1], fz = vertices[i * 3 + 2];
      const bx = vertices[(halfN + i) * 3], by = vertices[(halfN + i) * 3 + 1], bz = vertices[(halfN + i) * 3 + 2];
      const dist = Math.sqrt((fx - bx) ** 2 + (fy - by) ** 2 + (fz - bz) ** 2);
      if (dist < minThick) minThick = dist;
      if (dist > maxThick) maxThick = dist;
    }

    // Convert Volume from mm^3 to cm^3
    const volumeCm3 = Math.max(0, Math.abs(signedVolumeMm3) / 1000.0);
    // Standard PLA filament density ~1.24 g/cm3
    const estimatedWeightGrams = Math.round(volumeCm3 * 1.24 * 10) / 10;

    if (minThick < 0.6) {
      warnings.push(`Minimum thickness (${minThick.toFixed(2)}mm) is thin. Recommended >= 0.8mm to prevent light blowouts or pinholes.`);
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
      degenerateTriangles,
      warnings,
      eulerCharacteristic,
    };
  }
}
