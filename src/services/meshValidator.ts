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

    // 1. Edge map for topology & manifold validation
    // Key: "min(v0,v1)_max(v0,v1)", value: count of incident triangles & directed half-edges
    const edgeCounts = new Map<string, number>();
    const directedEdges = new Map<string, number>(); // "v0->v1" count to verify winding

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
      const edges = [
        [idxA, idxB],
        [idxB, idxC],
        [idxC, idxA],
      ];

      for (const [v0, v1] of edges) {
        const undirectedKey = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
        edgeCounts.set(undirectedKey, (edgeCounts.get(undirectedKey) || 0) + 1);

        const directedKey = `${v0}->${v1}`;
        directedEdges.set(directedKey, (directedEdges.get(directedKey) || 0) + 1);
      }
    }

    // 2. Topology Check
    let openBoundaryEdges = 0;
    let nonManifoldEdges = 0;
    let windingViolations = 0;

    for (const [edgeKey, count] of edgeCounts.entries()) {
      if (count === 1) {
        openBoundaryEdges++;
      } else if (count > 2) {
        nonManifoldEdges++;
      } else if (count === 2) {
        // Watertight edge: check that half-edges point in opposite directions
        const [s0, s1] = edgeKey.split('_');
        const countForward = directedEdges.get(`${s0}->${s1}`) || 0;
        const countBackward = directedEdges.get(`${s1}->${s0}`) || 0;
        if (countForward !== 1 || countBackward !== 1) {
          windingViolations++;
        }
      }
    }

    const uniqueEdgesCount = edgeCounts.size;
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

    const isStanding = boundingBox.size[2] > boundingBox.size[1];
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
