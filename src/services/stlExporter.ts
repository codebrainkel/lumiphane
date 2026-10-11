import { MeshGeometryData } from '../types/lithophane';

export class StlExporter {
  /**
   * Generates a standard compact binary STL file
   */
  static exportBinaryStl(geometry: MeshGeometryData, modelName: string = 'lithophane'): {
    blob: Blob;
    filename: string;
    filesizeBytes: number;
  } {
    const { vertices, indices, normals } = geometry;
    const numTriangles = indices.length / 3;

    // Binary STL format:
    // 80 bytes header
    // 4 bytes uint32 number of triangles
    // numTriangles * 50 bytes (12 bytes normal, 36 bytes 3 vertices, 2 bytes attribute byte count = 0)
    const bufferSize = 84 + numTriangles * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // 80-byte header
    const headerStr = 'Lumiphane 3D - Binary STL Lithophane Model';
    for (let i = 0; i < Math.min(80, headerStr.length); i++) {
      view.setUint8(i, headerStr.charCodeAt(i));
    }

    // Number of triangles (little-endian uint32 at offset 80)
    view.setUint32(80, numTriangles, true);

    let offset = 84;
    for (let t = 0; t < numTriangles; t++) {
      const idxA = indices[t * 3];
      const idxB = indices[t * 3 + 1];
      const idxC = indices[t * 3 + 2];

      const ax = vertices[idxA * 3], ay = vertices[idxA * 3 + 1], az = vertices[idxA * 3 + 2];
      const bx = vertices[idxB * 3], by = vertices[idxB * 3 + 1], bz = vertices[idxB * 3 + 2];
      const cx = vertices[idxC * 3], cy = vertices[idxC * 3 + 1], cz = vertices[idxC * 3 + 2];

      // Normal from triangle
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-7) {
        nx /= len; ny /= len; nz /= len;
      } else {
        nx = 0; ny = 0; nz = 1;
      }

      // Normal vector (12 bytes)
      view.setFloat32(offset, nx, true); offset += 4;
      view.setFloat32(offset, ny, true); offset += 4;
      view.setFloat32(offset, nz, true); offset += 4;

      // Vertex 1 (12 bytes)
      view.setFloat32(offset, ax, true); offset += 4;
      view.setFloat32(offset, ay, true); offset += 4;
      view.setFloat32(offset, az, true); offset += 4;

      // Vertex 2 (12 bytes)
      view.setFloat32(offset, bx, true); offset += 4;
      view.setFloat32(offset, by, true); offset += 4;
      view.setFloat32(offset, bz, true); offset += 4;

      // Vertex 3 (12 bytes)
      view.setFloat32(offset, cx, true); offset += 4;
      view.setFloat32(offset, cy, true); offset += 4;
      view.setFloat32(offset, cz, true); offset += 4;

      // Attribute byte count (2 bytes uint16 = 0)
      view.setUint16(offset, 0, true); offset += 2;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const cleanName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'lithophane';
    const isStanding = geometry.boundingBox.size[2] > geometry.boundingBox.size[1];
    const widthMm = Math.round(geometry.boundingBox.size[0]);
    const heightMm = Math.round(isStanding ? geometry.boundingBox.size[2] : geometry.boundingBox.size[1]);
    const filename = `${cleanName}_${widthMm}x${heightMm}mm.stl`;

    return {
      blob,
      filename,
      filesizeBytes: blob.size,
    };
  }
}
