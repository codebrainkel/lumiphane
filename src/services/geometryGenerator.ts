import { LithophaneSettings, MeshGeometryData } from '../types/lithophane';
import { clampBorderWidthMm, createBorderIconField } from './borderIcons';

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

    const N = cols * rows;
    const vertexCount = N * 2; // Front grid + Back grid

    const vertices = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const thicknesses = new Float32Array(vertexCount);

    // Number of triangles:
    // Front: 2 * (cols - 1) * (rows - 1)
    // Back:  2 * (cols - 1) * (rows - 1)
    // Top:   2 * (cols - 1)
    // Bot:   2 * (cols - 1)
    const isCylinder = settings.shape === 'cylinder';
    const isCube = settings.shape === 'cube';
    const isEnclosed = isCylinder || isCube;
    const triangleCount = isEnclosed ? 4 * cols * rows : 4 * (cols * rows - 1);
    const indices = new Uint32Array(triangleCount * 3);
    let triOffset = 0;

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

    // 1. Generate Front and Back Vertices
    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      // When standing: r=0 is top of image (Z=H), r=rows-1 is bottom (Z=0, bed contact)
      const pz = (1.0 - v) * H;
      const pyFlat = H / 2 - v * H;

      const distY = Math.min(v, 1.0 - v) * H;

      for (let c = 0; c < cols; c++) {
        const u = c / (cols - 1);
        const distX = Math.min(u, 1.0 - u) * W;

        // Luminance to thickness mapping
        const lum = luminanceGrid[r * cols + c];
        // Standard: dark (lum 0) => maxThickness; bright (lum 1) => minThickness
        let th = minTh + (1.0 - lum) * (maxTh - minTh);

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

          let brimExtra = 0;
          if (supportType !== 'none' && pz < 4.0) {
            const tBrim = Math.pow(1.0 - pz / 4.0, 2);
            brimExtra = 2.0 * tBrim;
          }
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

          let brimExtra = 0;
          if (supportType !== 'none' && pz < 4.0) {
            const tBrim = Math.pow(1.0 - pz / 4.0, 2);
            brimExtra = 2.0 * tBrim;
          }
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

            // Stabilizing brim at bed contact
            let brimExtra = 0;
            if (supportType !== 'none' && pz < 4.0) {
              const tBrim = Math.pow(1.0 - pz / 4.0, 2);
              brimExtra = 2.5 * tBrim;
            }
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

            // Stabilizing supports for tall thin item
            let flangeBack = 0;
            let flangeFront = 0;

            if (supportType === 'flange' || supportType === 'full') {
              if (pz <= supportHeight) {
                // Smooth parabolic taper to wide footing at bed contact (pz=0)
                const t = Math.pow(1.0 - pz / supportHeight, 2);
                flangeBack = (supportBaseDepth * 0.55) * t;
                flangeFront = (supportBaseDepth * 0.45) * t;
              }
            }

            if (supportType === 'buttress' || supportType === 'full') {
              // Triangular buttress ribs on outer 15% edges for lateral stability
              const edgeSpan = 0.16;
              const distFromSide = Math.min(u, 1.0 - u) / edgeSpan;
              if (distFromSide <= 1.0 && pz <= supportHeight * 2.8) {
                const sideFactor = Math.pow(1.0 - distFromSide, 1.5);
                const heightFactor = Math.pow(1.0 - pz / (supportHeight * 2.8), 2);
                const buttressDepth = (supportBaseDepth * 0.75) * sideFactor * heightFactor;
                flangeBack += buttressDepth;
              }
            }

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

    // 2. Generate Triangles with Consistent Winding & Outward Normals
    if (isEnclosed) {
      // ==============================================================
      // 360° HOLLOW TUBE / CUBE (Watertight Annular Shell)
      // ==============================================================
      // OUTER FACE (Facing outward)
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const cNext = (c + 1) % cols;
          const p00 = r * cols + c;
          const p10 = r * cols + cNext;
          const p01 = (r + 1) * cols + c;
          const p11 = (r + 1) * cols + cNext;

          // Tri 1: (p00, p10, p11)
          indices[triOffset++] = p00;
          indices[triOffset++] = p10;
          indices[triOffset++] = p11;

          // Tri 2: (p00, p11, p01)
          indices[triOffset++] = p00;
          indices[triOffset++] = p11;
          indices[triOffset++] = p01;
        }
      }

      // INNER CYLINDRICAL FACE (Facing inward towards center (0,0,z))
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const cNext = (c + 1) % cols;
          const b00 = N + r * cols + c;
          const b10 = N + r * cols + cNext;
          const b01 = N + (r + 1) * cols + c;
          const b11 = N + (r + 1) * cols + cNext;

          // Tri 1: (b00, b11, b10)
          indices[triOffset++] = b00;
          indices[triOffset++] = b11;
          indices[triOffset++] = b10;

          // Tri 2: (b00, b01, b11)
          indices[triOffset++] = b00;
          indices[triOffset++] = b01;
          indices[triOffset++] = b11;
        }
      }

      // TOP ANNULAR RIM (r = 0, Z = H, Normal points strictly +Z)
      for (let c = 0; c < cols; c++) {
        const cNext = (c + 1) % cols;
        const f0 = c;
        const f1 = cNext;
        const b0 = N + c;
        const b1 = N + cNext;

        // Tri 1: (f1, f0, b1)
        indices[triOffset++] = f1;
        indices[triOffset++] = f0;
        indices[triOffset++] = b1;

        // Tri 2: (f0, b0, b1)
        indices[triOffset++] = f0;
        indices[triOffset++] = b0;
        indices[triOffset++] = b1;
      }

      // BOTTOM ANNULAR RIM (r = rows - 1, Z = 0, Normal points strictly -Z flush with bed)
      const botRowOffset = (rows - 1) * cols;
      for (let c = 0; c < cols; c++) {
        const cNext = (c + 1) % cols;
        const f0 = botRowOffset + c;
        const f1 = botRowOffset + cNext;
        const b0 = N + botRowOffset + c;
        const b1 = N + botRowOffset + cNext;

        // Tri 1: (f0, f1, b1)
        indices[triOffset++] = f0;
        indices[triOffset++] = f1;
        indices[triOffset++] = b1;

        // Tri 2: (f0, b1, b0)
        indices[triOffset++] = f0;
        indices[triOffset++] = b1;
        indices[triOffset++] = b0;
      }
    } else if (isStanding) {
      // FRONT FACE (Facing +Y)
      // Vector p10-p00 is +X, Vector p01-p00 is -Z -> (+X) x (-Z) = +Y
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const p00 = r * cols + c;
          const p10 = r * cols + (c + 1);
          const p01 = (r + 1) * cols + c;
          const p11 = (r + 1) * cols + (c + 1);

          // Tri 1: (p00, p10, p11)
          indices[triOffset++] = p00;
          indices[triOffset++] = p10;
          indices[triOffset++] = p11;

          // Tri 2: (p00, p11, p01)
          indices[triOffset++] = p00;
          indices[triOffset++] = p11;
          indices[triOffset++] = p01;
        }
      }

      // BACK FACE (Facing -Y, reverse winding)
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const b00 = N + r * cols + c;
          const b10 = N + r * cols + (c + 1);
          const b01 = N + (r + 1) * cols + c;
          const b11 = N + (r + 1) * cols + (c + 1);

          // Tri 1: (b00, b11, b10)
          indices[triOffset++] = b00;
          indices[triOffset++] = b11;
          indices[triOffset++] = b10;

          // Tri 2: (b00, b01, b11)
          indices[triOffset++] = b00;
          indices[triOffset++] = b01;
          indices[triOffset++] = b11;
        }
      }

      // TOP EDGE (r = 0, Z = H, Normal points +Z)
      for (let c = 0; c < cols - 1; c++) {
        const f0 = c;
        const f1 = c + 1;
        const b0 = N + f0;
        const b1 = N + f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b1;
        indices[triOffset++] = f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b0;
        indices[triOffset++] = b1;
      }

      // BOTTOM EDGE (r = rows - 1, Z = 0, Normal points -Z flush with bed)
      const botRowOffset = (rows - 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        const f0 = botRowOffset + c;
        const f1 = botRowOffset + (c + 1);
        const b0 = N + f0;
        const b1 = N + f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = f1;
        indices[triOffset++] = b1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b1;
        indices[triOffset++] = b0;
      }

      // LEFT EDGE (c = 0, X = -W/2, Normal points -X)
      for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols;
        const f1 = (r + 1) * cols;
        const b0 = N + f0;
        const b1 = N + f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = f1;
        indices[triOffset++] = b1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b1;
        indices[triOffset++] = b0;
      }

      // RIGHT EDGE (c = cols - 1, X = +W/2, Normal points +X)
      for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols + (cols - 1);
        const f1 = (r + 1) * cols + (cols - 1);
        const b0 = N + f0;
        const b1 = N + f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b1;
        indices[triOffset++] = f1;

        indices[triOffset++] = f0;
        indices[triOffset++] = b0;
        indices[triOffset++] = b1;
      }
    } else {
      // FLAT LAYOUT
      // Front face (+Z)
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const p00 = r * cols + c;
          const p10 = r * cols + (c + 1);
          const p01 = (r + 1) * cols + c;
          const p11 = (r + 1) * cols + (c + 1);

          indices[triOffset++] = p00;
          indices[triOffset++] = p01;
          indices[triOffset++] = p11;

          indices[triOffset++] = p00;
          indices[triOffset++] = p11;
          indices[triOffset++] = p10;
        }
      }

      // Back face (-Z)
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const b00 = N + r * cols + c;
          const b10 = N + r * cols + (c + 1);
          const b01 = N + (r + 1) * cols + c;
          const b11 = N + (r + 1) * cols + (c + 1);

          indices[triOffset++] = b00;
          indices[triOffset++] = b11;
          indices[triOffset++] = b01;

          indices[triOffset++] = b00;
          indices[triOffset++] = b10;
          indices[triOffset++] = b11;
        }
      }

      // Perimeter edges
      for (let c = 0; c < cols - 1; c++) {
        const f0 = c, f1 = c + 1, b0 = N + f0, b1 = N + f1;
        indices[triOffset++] = f0; indices[triOffset++] = f1; indices[triOffset++] = b1;
        indices[triOffset++] = f0; indices[triOffset++] = b1; indices[triOffset++] = b0;
      }
      const botRowOffset = (rows - 1) * cols;
      for (let c = 0; c < cols - 1; c++) {
        const f0 = botRowOffset + c, f1 = botRowOffset + (c + 1), b0 = N + f0, b1 = N + f1;
        indices[triOffset++] = f0; indices[triOffset++] = b1; indices[triOffset++] = f1;
        indices[triOffset++] = f0; indices[triOffset++] = b0; indices[triOffset++] = b1;
      }
      for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols, f1 = (r + 1) * cols, b0 = N + f0, b1 = N + f1;
        indices[triOffset++] = f0; indices[triOffset++] = b0; indices[triOffset++] = b1;
        indices[triOffset++] = f0; indices[triOffset++] = b1; indices[triOffset++] = f1;
      }
      for (let r = 0; r < rows - 1; r++) {
        const f0 = r * cols + (cols - 1), f1 = (r + 1) * cols + (cols - 1), b0 = N + f0, b1 = N + f1;
        indices[triOffset++] = f0; indices[triOffset++] = f1; indices[triOffset++] = b1;
        indices[triOffset++] = f0; indices[triOffset++] = b1; indices[triOffset++] = b0;
      }
    }

    // 3. Compute Per-Vertex Smooth Normals
    this.computeNormals(vertices, indices, normals);

    return {
      vertices,
      indices,
      normals,
      uvs,
      thicknesses,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        size: [maxX - minX, maxY - minY, maxZ - minZ],
      },
      gridResolution: { cols, rows },
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
