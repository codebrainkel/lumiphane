import { MeshGeometryData, MeshValidationResult } from '../types/lithophane';

const SAMPLE_MM = 1;
const FOLD_DOT = Math.cos((170 * Math.PI) / 180);

/**
 * Image-area wall thickness along each shape's thickness axis.
 * Flat panels use Y, or Z when the panel lies on the bed. Cylinders and
 * curved arcs use the radial direction. Each cube face uses that face's axis.
 * Samples are 1 mm apart over the photo, with no short-hit filter.
 */
function measureImageThickness(geometry: MeshGeometryData): { min: number; max: number } {
  const { vertices, indices, boundingBox } = geometry;
  const triangleCount = indices.length / 3;
  if (triangleCount < 4 || vertices.length < 9) return { min: 0, max: 0 };

  const kind = classifyThickness(vertices, boundingBox);
  const center = kind === 'curved' ? arcCenter(vertices, boundingBox) : { x: 0, y: 0, r: 0 };
  const bins = buildThicknessBins(vertices, indices, kind, boundingBox, center);
  const samples = thicknessSamples(vertices, indices, boundingBox, kind, bins);
  if (samples.length === 0) return { min: 0, max: 0 };

  const gaps: number[] = [];
  for (let s = 0; s < samples.length; s++) {
    const gap = rayWall(vertices, indices, bins, samples[s]);
    if (gap === null || gap < 0.05 || gap > 12) continue;
    gaps.push(gap);
  }
  if (gaps.length < 4) return { min: 0, max: 0 };
  // Frame, brim, and corner chords are thicker than the 3 mm image.
  // When they are the minority, they are not the photo.
  let under = 0;
  for (let i = 0; i < gaps.length; i++) if (gaps[i] <= 3.02) under++;
  const imageOnly = under >= 4 && under * 4 >= gaps.length * 3;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < gaps.length; i++) {
    if (imageOnly && gaps[i] > 3.02) continue;
    if (gaps[i] < min) min = gaps[i];
    if (gaps[i] > max) max = gaps[i];
  }
  return { min, max };
}

type ThicknessKind = 'flat-y' | 'flat-z' | 'cylinder' | 'cube' | 'curved';

type ThicknessRay = {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
  key: number;
  maxT: number;
};

function classifyThickness(vertices: Float32Array, bbox: MeshGeometryData['boundingBox']): ThicknessKind {
  const sx = bbox.size[0];
  const sy = bbox.size[1];
  const sz = bbox.size[2];
  const shell = sx > 30 && sy > 30 && sz > 20 && Math.abs(sx - sy) / Math.max(sx, sy) < 0.25;
  if (shell) {
    const bins = new Array<number>(8).fill(0);
    const n = vertices.length / 3;
    const step = Math.max(1, Math.floor(n / 4000));
    for (let i = 0; i < n; i += step) {
      const x = vertices[i * 3];
      const y = vertices[i * 3 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 8) % 8;
      bins[b]++;
    }
    const hi = Math.max(...bins);
    const lo = Math.min(...bins);
    // A hollow cube leaves at least one octant empty. A full cylinder does not.
    if (lo === 0 || hi > lo * 2.4) return 'cube';
    return 'cylinder';
  }
  if (sz < sx * 0.45 && sz < sy * 0.45) return 'flat-z';
  if (backIsArc(vertices, bbox)) return 'curved';
  return 'flat-y';
}

function backIsArc(vertices: Float32Array, bbox: MeshGeometryData['boundingBox']): boolean {
  const z0 = bbox.min[2] + bbox.size[2] * 0.45;
  const z1 = bbox.min[2] + bbox.size[2] * 0.55;
  const buckets = new Map<number, number>();
  const n = vertices.length / 3;
  const step = Math.max(1, Math.floor(n / 8000));
  for (let i = 0; i < n; i += step) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (z < z0 || z > z1 || !Number.isFinite(y)) continue;
    const key = Math.round(x);
    const prev = buckets.get(key);
    if (prev === undefined || y < prev) buckets.set(key, y);
  }
  if (buckets.size < 5) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const y of buckets.values()) {
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return hi - lo > 2;
}

function planeKey(u: number, v: number): number {
  return (u + 8192) * 20000 + (v + 8192);
}

let angleZBase = 0;
let angleZSpan = 1;

function angleKey(a: number, z: number, angleBins: number): number {
  const aa = ((a % angleBins) + angleBins) % angleBins;
  const iz = z - angleZBase;
  if (iz < 0 || iz >= angleZSpan) return -1;
  return aa * angleZSpan + iz;
}

type ThicknessBins = {
  get(key: number): ArrayLike<number> | undefined;
  angleBins: number;
};

function buildThicknessBins(
  vertices: Float32Array,
  indices: Uint32Array,
  kind: ThicknessKind,
  bbox: MeshGeometryData['boundingBox'],
  center: { x: number; y: number; r: number } | null,
): ThicknessBins {
  const bins = new Map<number, number[]>();
  const triangleCount = indices.length / 3;
  const push = (key: number, tri: number) => {
    if (key < 0) return;
    const bucket = bins.get(key);
    if (bucket) bucket.push(tri);
    else bins.set(key, [tri]);
  };
  const cx = center?.x ?? 0;
  const cy = center?.y ?? 0;
  const radius = Math.max(1, center && center.r > 5 ? center.r : Math.hypot(bbox.size[0], bbox.size[1]) * 0.5);
  const angleBins = Math.max(64, Math.ceil((2 * Math.PI * radius) / SAMPLE_MM));
  angleZBase = Math.floor(bbox.min[2] / SAMPLE_MM) - 1;
  angleZSpan = Math.floor(bbox.max[2] / SAMPLE_MM) - angleZBase + 2;
  for (let tri = 0; tri < triangleCount && kind !== 'cylinder' && kind !== 'curved'; tri++) {
    const ia = indices[tri * 3] * 3;
    const ib = indices[tri * 3 + 1] * 3;
    const ic = indices[tri * 3 + 2] * 3;
    const xs = [vertices[ia], vertices[ib], vertices[ic]];
    const ys = [vertices[ia + 1], vertices[ib + 1], vertices[ic + 1]];
    const zs = [vertices[ia + 2], vertices[ib + 2], vertices[ic + 2]];
    if (![...xs, ...ys, ...zs].every(Number.isFinite)) continue;
    if (kind === 'cube') {
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const spanZ = Math.max(...zs) - Math.min(...zs);
      const yFace = spanY <= spanX && spanY <= spanZ;
      const xFace = !yFace && spanX <= spanY && spanX <= spanZ;
      if (!yFace && !xFace) continue;
      const u = yFace ? xs : ys;
      const prefix = yFace ? 0 : 500_000_000;
      const u0 = Math.min(...u);
      const u1 = Math.max(...u);
      const v0 = Math.min(...zs);
      const v1 = Math.max(...zs);
      const i0 = Math.floor(u0 / SAMPLE_MM);
      const i1 = Math.floor(u1 / SAMPLE_MM);
      const k0 = Math.floor(v0 / SAMPLE_MM);
      const k1 = Math.floor(v1 / SAMPLE_MM);
      for (let iv = k0; iv <= k1; iv++) {
        for (let iu = i0; iu <= i1; iu++) push(prefix + planeKey(iu, iv), tri);
      }
    } else {
      const u = xs;
      const v = kind === 'flat-z' ? ys : zs;
      const u0 = Math.min(...u);
      const u1 = Math.max(...u);
      const v0 = Math.min(...v);
      const v1 = Math.max(...v);
      const i0 = Math.floor(u0 / SAMPLE_MM);
      const i1 = Math.floor(u1 / SAMPLE_MM);
      const k0 = Math.floor(v0 / SAMPLE_MM);
      const k1 = Math.floor(v1 / SAMPLE_MM);
      for (let iv = k0; iv <= k1; iv++) {
        for (let iu = i0; iu <= i1; iu++) push(planeKey(iu, iv), tri);
      }
    }
  }
  if (kind === 'cylinder' || kind === 'curved') {
    const binCount = angleBins * angleZSpan;
    const buckets: number[][] = new Array(binCount);
    const vertexCount = vertices.length / 3;
    const ang = new Float32Array(vertexCount);
    const invTwoPi = 1 / (2 * Math.PI);
    for (let v = 0; v < vertexCount; v++) {
      ang[v] = (Math.atan2(vertices[v * 3 + 1] - cy, vertices[v * 3] - cx) + Math.PI) * invTwoPi;
    }
    for (let tri = 0; tri < triangleCount; tri++) {
      const iA = indices[tri * 3];
      const iB = indices[tri * 3 + 1];
      const iC = indices[tri * 3 + 2];
      const u0 = ang[iA];
      const u1 = ang[iB];
      const u2 = ang[iC];
      const z0 = vertices[iA * 3 + 2];
      const z1 = vertices[iB * 3 + 2];
      const z2 = vertices[iC * 3 + 2];
      if (!Number.isFinite(u0 + u1 + u2 + z0 + z1 + z2)) continue;
      let a0 = u0;
      let a1 = u0;
      if (u1 < a0) a0 = u1;
      if (u2 < a0) a0 = u2;
      if (u1 > a1) a1 = u1;
      if (u2 > a1) a1 = u2;
      let zLo = z0;
      let zHi = z0;
      if (z1 < zLo) zLo = z1;
      if (z2 < zLo) zLo = z2;
      if (z1 > zHi) zHi = z1;
      if (z2 > zHi) zHi = z2;
      const k0 = Math.floor(zLo / SAMPLE_MM) - angleZBase;
      const k1 = Math.floor(zHi / SAMPLE_MM) - angleZBase;
      if (a1 - a0 > 0.5) {
        const iLeft = Math.min(angleBins - 1, Math.floor(a0 * angleBins));
        const iRight = Math.max(0, Math.floor(a1 * angleBins));
        for (let iz = k0; iz <= k1; iz++) {
          if (iz < 0 || iz >= angleZSpan) continue;
          const row = iz;
          for (let iaBin = 0; iaBin <= iLeft; iaBin++) {
            const key = iaBin * angleZSpan + row;
            const bucket = buckets[key];
            if (bucket) bucket.push(tri);
            else buckets[key] = [tri];
          }
          for (let iaBin = iRight; iaBin < angleBins; iaBin++) {
            const key = iaBin * angleZSpan + row;
            const bucket = buckets[key];
            if (bucket) bucket.push(tri);
            else buckets[key] = [tri];
          }
        }
      } else {
        const i0 = Math.max(0, Math.floor(a0 * angleBins));
        const i1 = Math.min(angleBins - 1, Math.floor(a1 * angleBins));
        if (i0 === i1 && k0 === k1) {
          if (k0 >= 0 && k0 < angleZSpan && i0 < angleBins) {
            const key = i0 * angleZSpan + k0;
            const bucket = buckets[key];
            if (bucket) bucket.push(tri);
            else buckets[key] = [tri];
          }
        } else {
          for (let iz = k0; iz <= k1; iz++) {
            if (iz < 0 || iz >= angleZSpan) continue;
            for (let iaBin = i0; iaBin <= i1; iaBin++) {
              const key = iaBin * angleZSpan + iz;
              const bucket = buckets[key];
              if (bucket) bucket.push(tri);
              else buckets[key] = [tri];
            }
          }
        }
      }
    }
    return {
      angleBins,
      get(key: number) {
        return key >= 0 && key < binCount ? buckets[key] : undefined;
      },
    };
  }
  return {
    angleBins,
    get(key: number) {
      return bins.get(key);
    },
  };
}

function rayTri(
  vertices: Float32Array,
  indices: Uint32Array,
  tri: number,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  const ia = indices[tri * 3] * 3;
  const ib = indices[tri * 3 + 1] * 3;
  const ic = indices[tri * 3 + 2] * 3;
  const x0 = vertices[ia];
  const y0 = vertices[ia + 1];
  const z0 = vertices[ia + 2];
  const abx = vertices[ib] - x0;
  const aby = vertices[ib + 1] - y0;
  const abz = vertices[ib + 2] - z0;
  const acx = vertices[ic] - x0;
  const acy = vertices[ic + 1] - y0;
  const acz = vertices[ic + 2] - z0;
  const px = dy * acz - dz * acy;
  const py = dz * acx - dx * acz;
  const pz = dx * acy - dy * acx;
  const det = abx * px + aby * py + abz * pz;
  if (det > -1e-8 && det < 1e-8) return Infinity;
  const inv = 1 / det;
  const tx = ox - x0;
  const ty = oy - y0;
  const tz = oz - z0;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-4 || u > 1.0001) return Infinity;
  const qx = ty * abz - tz * aby;
  const qy = tz * abx - tx * abz;
  const qz = tx * aby - ty * abx;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-4 || u + v > 1.0001) return Infinity;
  const t = (acx * qx + acy * qy + acz * qz) * inv;
  return t > 1e-3 ? t : Infinity;
}

function rayWall(
  vertices: Float32Array,
  indices: Uint32Array,
  bins: ThicknessBins,
  ray: ThicknessRay,
): number | null {
  const bucket = bins.get(ray.key);
  if (!bucket) return null;
  const hits: number[] = [];
  for (let i = 0; i < bucket.length; i++) {
    const t = rayTri(vertices, indices, bucket[i], ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz);
    if (t < ray.maxT) hits.push(t);
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a - b);
  const uniq = [hits[0]];
  for (let i = 1; i < hits.length; i++) {
    if (hits[i] - uniq[uniq.length - 1] > 0.02) uniq.push(hits[i]);
  }
  if (uniq.length < 2) return null;
  return uniq[1] - uniq[0];
}

function enterImage(values: number[]): number {
  const n = values.length;
  if (n < 4) return 0;
  let start = 0;
  while (start < n && !Number.isFinite(values[start])) start++;
  if (start >= n - 2) return 0;
  const edge = values[start];
  const mid = values[n >> 1];
  if (!Number.isFinite(mid)) return start;
  if (edge < mid + 0.12) return start;
  let i = start + 1;
  while (i < n - 1) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      i++;
      continue;
    }
    const slope = value - values[i - 1];
    if (slope > 0.05) return i;
    if (slope < -0.2) {
      i++;
      continue;
    }
    if (value > mid + 0.25) {
      i++;
      continue;
    }
    return i;
  }
  return Math.min(i, Math.max(0, n - 2));
}

function contentSpan(values: number[]): [number, number] {
  const n = values.length;
  if (n === 0) return [0, -1];
  const left = enterImage(values);
  const right = n - 1 - enterImage(values.slice().reverse());
  if (left >= right) return [0, n - 1];
  return [left, right];
}

function flatSamples(
  vertices: Float32Array,
  indices: Uint32Array,
  bbox: MeshGeometryData['boundingBox'],
  bins: ThicknessBins,
  axis: 'y' | 'z',
): ThicknessRay[] {
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  let seen = 0;
  const n = vertices.length / 3;
  for (let i = 0; i < n; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (axis === 'y' && Math.abs(y) > 0.08) continue;
    if (axis === 'z' && Math.abs(z - bbox.min[2]) > 0.08) continue;
    const u = x;
    const v = axis === 'y' ? z : y;
    seen++;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  if (seen < 8) {
    u0 = bbox.min[0];
    u1 = bbox.max[0];
    v0 = axis === 'y' ? bbox.min[2] : bbox.min[1];
    v1 = axis === 'y' ? bbox.max[2] : bbox.max[1];
  }
  const origin = axis === 'y' ? bbox.min[1] - 2 : bbox.min[2] - 2;
  const maxT = (axis === 'y' ? bbox.size[1] : bbox.size[2]) + 6;
  const rayAt = (u: number, v: number): ThicknessRay =>
    axis === 'y'
      ? { ox: u, oy: origin, oz: v, dx: 0, dy: 1, dz: 0, key: planeKey(Math.floor(u / SAMPLE_MM), Math.floor(v / SAMPLE_MM)), maxT }
      : { ox: u, oy: v, oz: origin, dx: 0, dy: 0, dz: 1, key: planeKey(Math.floor(u / SAMPLE_MM), Math.floor(v / SAMPLE_MM)), maxT };
  const us: number[] = [];
  const vs: number[] = [];
  for (let u = u0 + SAMPLE_MM * 0.5; u < u1 - 0.2; u += SAMPLE_MM) us.push(u);
  for (let v = v0 + SAMPLE_MM * 0.5; v < v1 - 0.2; v += SAMPLE_MM) vs.push(v);
  if (us.length < 3 || vs.length < 3) return [];
  const midU = us[us.length >> 1];
  const midV = vs[vs.length >> 1];
  const row = us.map((u) => rayWall(vertices, indices, bins, rayAt(u, midV)) ?? NaN);
  const col = vs.map((v) => rayWall(vertices, indices, bins, rayAt(midU, v)) ?? NaN);
  const [c0, c1] = contentSpan(row);
  const [r0, r1] = contentSpan(col);
  const rays: ThicknessRay[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) rays.push(rayAt(us[c], vs[r]));
  }
  return rays;
}

function cylinderSamples(bbox: MeshGeometryData['boundingBox'], angleBins: number): ThicknessRay[] {
  const z0 = bbox.min[2];
  const z1 = bbox.max[2];
  const zs: number[] = [];
  for (let z = z0 + SAMPLE_MM * 0.5; z < z1 - 0.2; z += SAMPLE_MM) zs.push(z);
  if (zs.length < 3) return [];
  const maxT = Math.hypot(bbox.size[0], bbox.size[1]);
  const at = (phi: number, z: number): ThicknessRay => {
    const dx = Math.sin(phi);
    const dy = Math.cos(phi);
    const unit = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    return {
      ox: 0,
      oy: 0,
      oz: z,
      dx,
      dy,
      dz: 0,
      key: angleKey(Math.floor(unit * angleBins), Math.floor(z / SAMPLE_MM), angleBins),
      maxT,
    };
  };
  return radialGrid(zs, angleBins, at, Math.PI * 2);
}

function cubeSamples(
  vertices: Float32Array,
  indices: Uint32Array,
  bbox: MeshGeometryData['boundingBox'],
  bins: ThicknessBins,
): ThicknessRay[] {
  const hx = bbox.size[0] * 0.42;
  const hy = bbox.size[1] * 0.42;
  const z0 = bbox.min[2];
  const z1 = bbox.max[2];
  const zs: number[] = [];
  for (let z = z0 + SAMPLE_MM * 0.5; z < z1 - 0.2; z += SAMPLE_MM) zs.push(z);
  const xs: number[] = [];
  for (let x = -hx; x <= hx; x += SAMPLE_MM) xs.push(x);
  const ys: number[] = [];
  for (let y = -hy; y <= hy; y += SAMPLE_MM) ys.push(y);
  if (zs.length < 3 || xs.length < 3) return [];
  const maxT = Math.max(bbox.size[0], bbox.size[1]);
  const faces: ThicknessRay[][] = [];
  const yFace = (x: number, z: number, sign: number): ThicknessRay => ({
    ox: x,
    oy: 0,
    oz: z,
    dx: 0,
    dy: sign,
    dz: 0,
    key: planeKey(Math.floor(x / SAMPLE_MM), Math.floor(z / SAMPLE_MM)),
    maxT,
  });
  const xFace = (y: number, z: number, sign: number): ThicknessRay => ({
    ox: 0,
    oy: y,
    oz: z,
    dx: sign,
    dy: 0,
    dz: 0,
    key: 500_000_000 + planeKey(Math.floor(y / SAMPLE_MM), Math.floor(z / SAMPLE_MM)),
    maxT,
  });
  const measureFace = (us: number[], faceZs: number[], at: (u: number, z: number) => ThicknessRay) => {
    const midU = us[us.length >> 1];
    const midZ = faceZs[faceZs.length >> 1];
    const row = us.map((u) => rayWall(vertices, indices, bins, at(u, midZ)) ?? NaN);
    const col = faceZs.map((z) => rayWall(vertices, indices, bins, at(midU, z)) ?? NaN);
    const [c0, c1] = contentSpan(row);
    const [r0, r1] = contentSpan(col);
    const rays: ThicknessRay[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) rays.push(at(us[c], faceZs[r]));
    }
    return rays;
  };
  faces.push(measureFace(xs, zs, (u, z) => yFace(u, z, 1)));
  faces.push(measureFace(xs, zs, (u, z) => yFace(u, z, -1)));
  faces.push(measureFace(ys, zs, (u, z) => xFace(u, z, 1)));
  faces.push(measureFace(ys, zs, (u, z) => xFace(u, z, -1)));
  return faces.flat();
}

function faceGrid(us: number[], zs: number[], at: (u: number, z: number) => ThicknessRay): ThicknessRay[] {
  const midU = us[us.length >> 1];
  const midZ = zs[zs.length >> 1];
  const row = us.map((u) => at(u, midZ));
  const col = zs.map((z) => at(midU, z));
  return gridFromProbes(us, zs, row, col, at);
}

function radialGrid(
  zs: number[],
  angleBins: number,
  at: (phi: number, z: number) => ThicknessRay,
  full: number,
): ThicknessRay[] {
  const phis: number[] = [];
  for (let i = 0; i < angleBins; i++) phis.push((i + 0.5) * (full / angleBins));
  const midPhi = phis[phis.length >> 1];
  const midZ = zs[zs.length >> 1];
  const col = zs.map((z) => at(midPhi, z));
  const row = phis.map((phi) => at(phi, midZ));
  return gridFromProbes(phis, zs, row, col, (phi, z) => at(phi, z));
}

function gridFromProbes(
  us: number[],
  vs: number[],
  row: ThicknessRay[],
  col: ThicknessRay[],
  at: (u: number, v: number) => ThicknessRay,
): ThicknessRay[] {
  void row;
  void col;
  const rays: ThicknessRay[] = [];
  for (let r = 0; r < vs.length; r++) {
    for (let c = 0; c < us.length; c++) rays.push(at(us[c], vs[r]));
  }
  return rays;
}

function arcCenter(vertices: Float32Array, bbox: MeshGeometryData['boundingBox']): { x: number; y: number; r: number } | null {
  const buckets = new Map<number, { x: number; y: number }>();
  const n = vertices.length / 3;
  const step = Math.max(1, Math.floor(n / 6000));
  const zCut = bbox.min[2] + Math.min(6, bbox.size[2] * 0.08);
  for (let i = 0; i < n; i += step) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (z < zCut || !Number.isFinite(y)) continue;
    const key = Math.round(x);
    const prev = buckets.get(key);
    if (!prev || y < prev.y) buckets.set(key, { x, y });
  }
  const pts = [...buckets.values()].sort((a, b) => a.x - b.x);
  if (pts.length < 3) return null;
  const a = pts[0];
  const b = pts[pts.length >> 1];
  const c = pts[pts.length - 1];
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-4) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - x, a.y - y);
  if (!Number.isFinite(r) || r < 5) return null;
  return { x, y, r };
}

function thicknessSamples(
  vertices: Float32Array,
  indices: Uint32Array,
  bbox: MeshGeometryData['boundingBox'],
  kind: ThicknessKind,
  bins: ThicknessBins,
): ThicknessRay[] {
  const angleBins = bins.angleBins;
  if (kind === 'cylinder') {
    const rays = cylinderSamples(bbox, angleBins);
    return insetRays(vertices, indices, bins, rays, 'z');
  }
  if (kind === 'cube') return cubeSamples(vertices, indices, bbox, bins);
  if (kind === 'curved') return curvedSamples(vertices, indices, bbox, bins, angleBins);
  return flatSamples(vertices, indices, bbox, bins, kind === 'flat-z' ? 'z' : 'y');
}

function curvedSamples(
  vertices: Float32Array,
  indices: Uint32Array,
  bbox: MeshGeometryData['boundingBox'],
  bins: ThicknessBins,
  angleBins: number,
): ThicknessRay[] {
  const center = arcCenter(vertices, bbox);
  if (!center) return flatSamples(vertices, indices, bbox, bins, 'y');
  const zs: number[] = [];
  for (let z = bbox.min[2] + SAMPLE_MM * 0.5; z < bbox.max[2] - 0.2; z += SAMPLE_MM) zs.push(z);
  const left = Math.atan2(bbox.min[0] - center.x, 0);
  const right = Math.atan2(bbox.max[0] - center.x, 0);
  void left;
  void right;
  const span = Math.atan2(bbox.size[0] * 0.5, center.r);
  const steps = Math.max(4, Math.ceil((Math.abs(span) * 2 * center.r) / SAMPLE_MM));
  const phis: number[] = [];
  for (let i = 1; i < steps; i++) phis.push(-span + (2 * span * i) / steps);
  const maxT = center.r + 20;
  const at = (phi: number, z: number): ThicknessRay => {
    const dx = Math.sin(phi);
    const dy = Math.cos(phi);
    const unit = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
    return {
      ox: center.x,
      oy: center.y,
      oz: z,
      dx,
      dy,
      dz: 0,
      key: angleKey(Math.floor(unit * angleBins), Math.floor(z / SAMPLE_MM), angleBins),
      maxT,
    };
  };
  if (phis.length < 3 || zs.length < 3) return [];
  const row = phis.map((phi) => rayWall(vertices, indices, bins, at(phi, zs[zs.length >> 1])) ?? NaN);
  const col = zs.map((z) => rayWall(vertices, indices, bins, at(phis[phis.length >> 1], z)) ?? NaN);
  const [c0, c1] = contentSpan(row);
  const [r0, r1] = contentSpan(col);
  const rays: ThicknessRay[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) rays.push(at(phis[c], zs[r]));
  }
  return rays;
}

function insetRays(
  vertices: Float32Array,
  indices: Uint32Array,
  bins: ThicknessBins,
  rays: ThicknessRay[],
  along: 'z',
): ThicknessRay[] {
  if (rays.length < 8) return rays;
  const zs = [...new Set(rays.map((ray) => ray.oz))].sort((a, b) => a - b);
  const probe = zs.map((z) => {
    const ray = rays.find((item) => item.oz === z);
    return ray ? rayWall(vertices, indices, bins, ray) ?? NaN : NaN;
  });
  const [r0, r1] = contentSpan(probe);
  const zLo = zs[Math.max(0, r0)] ?? zs[0];
  const zHi = zs[Math.min(zs.length - 1, r1)] ?? zs[zs.length - 1];
  void along;
  return rays.filter((ray) => ray.oz >= zLo && ray.oz <= zHi);
}

/** Stable counting sort: primary key min vertex, secondary key max vertex. */
function sortEdgeOrder(mins: Uint32Array, maxs: Uint32Array, n: number, range: number): Uint32Array {
  if (n === 0 || range <= 0) return new Uint32Array(0);
  const scatter = (keys: Uint32Array, current: Uint32Array | null): Uint32Array => {
    const counts = new Uint32Array(range);
    if (current) {
      for (let i = 0; i < n; i++) counts[keys[current[i]]]++;
    } else {
      for (let i = 0; i < n; i++) counts[keys[i]]++;
    }
    let sum = 0;
    for (let i = 0; i < range; i++) {
      const c = counts[i];
      counts[i] = sum;
      sum += c;
    }
    const next = new Uint32Array(n);
    if (current) {
      for (let i = 0; i < n; i++) {
        const id = current[i];
        next[counts[keys[id]]++] = id;
      }
    } else {
      for (let i = 0; i < n; i++) next[counts[keys[i]]++] = i;
    }
    return next;
  };
  return scatter(mins, scatter(maxs, null));
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

    // 1. Edge arrays for topology & manifold validation.
    // Counting-sort by the two vertex indices. A bigint key per edge is too slow
    // on a million-triangle cylinder.
    const numEdges = triangleCount * 3;
    const edgeMin = new Uint32Array(numEdges);
    const edgeMax = new Uint32Array(numEdges);
    const edgeTri = new Uint32Array(numEdges);
    const edgeDir = new Uint8Array(numEdges);
    const faceNx = new Float32Array(triangleCount);
    const faceNy = new Float32Array(triangleCount);
    const faceNz = new Float32Array(triangleCount);
    let edgePtr = 0;
    const vertexLimit = Math.min(vertexCount, 2_097_152);

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
      faceNx[i] = crossX;
      faceNy[i] = crossY;
      faceNz[i] = crossZ;
      if (areaSq < 1e-12) {
        degenerateTriangles++;
      }

      // Divergence theorem contribution
      signedVolumeMm3 += (ax * crossX + ay * crossY + az * crossZ) / 6.0;

      // Oriented edges, stored as (min, max) plus whether the triangle walks min → max.
      if (idxA < vertexLimit && idxB < vertexLimit) {
        const lo = idxA < idxB;
        edgeMin[edgePtr] = lo ? idxA : idxB;
        edgeMax[edgePtr] = lo ? idxB : idxA;
        edgeTri[edgePtr] = i;
        edgeDir[edgePtr] = lo ? 1 : 0;
        edgePtr++;
      }
      if (idxB < vertexLimit && idxC < vertexLimit) {
        const lo = idxB < idxC;
        edgeMin[edgePtr] = lo ? idxB : idxC;
        edgeMax[edgePtr] = lo ? idxC : idxB;
        edgeTri[edgePtr] = i;
        edgeDir[edgePtr] = lo ? 1 : 0;
        edgePtr++;
      }
      if (idxC < vertexLimit && idxA < vertexLimit) {
        const lo = idxC < idxA;
        edgeMin[edgePtr] = lo ? idxC : idxA;
        edgeMax[edgePtr] = lo ? idxA : idxC;
        edgeTri[edgePtr] = i;
        edgeDir[edgePtr] = lo ? 1 : 0;
        edgePtr++;
      }
    }

    // 2. Topology via a stable counting sort on (min vertex, max vertex).
    const order = sortEdgeOrder(edgeMin, edgeMax, edgePtr, vertexLimit);

    let openBoundaryEdges = 0;
    let nonManifoldEdges = 0;
    let uniqueEdgesCount = 0;
    let foldedPairCount = 0;
    let windingViolations = 0;

    let eIdx = 0;
    while (eIdx < edgePtr) {
      const id0 = order[eIdx];
      const minV = edgeMin[id0];
      const maxV = edgeMax[id0];
      let nextIdx = eIdx + 1;
      while (nextIdx < edgePtr) {
        const idN = order[nextIdx];
        if (edgeMin[idN] !== minV || edgeMax[idN] !== maxV) break;
        nextIdx++;
      }
      const count = nextIdx - eIdx;
      uniqueEdgesCount++;
      if (count === 1) {
        openBoundaryEdges++;
      } else if (count > 2) {
        nonManifoldEdges++;
      } else {
        const id1 = order[eIdx + 1];
        if (edgeDir[id0] === edgeDir[id1]) windingViolations++;
        const t0 = edgeTri[id0];
        const t1 = edgeTri[id1];
        const ax = faceNx[t0];
        const ay = faceNy[t0];
        const az = faceNz[t0];
        const bx = faceNx[t1];
        const by = faceNy[t1];
        const bz = faceNz[t1];
        const dot = ax * bx + ay * by + az * bz;
        const la = ax * ax + ay * ay + az * az;
        const lb = bx * bx + by * by + bz * bz;
        if (dot < 0 && la > 1e-20 && lb > 1e-20 && dot * dot > FOLD_DOT * FOLD_DOT * la * lb) foldedPairCount++;
      }
      eIdx = nextIdx;
    }

    // Euler Characteristic: V - E + F
    const eulerCharacteristic = vertexCount - uniqueEdgesCount + triangleCount;

    const isWatertight = openBoundaryEdges === 0 && nonManifoldEdges === 0;
    const isManifold = isWatertight && windingViolations === 0;

    const measured = measureImageThickness(geometry);
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
      isValid: isManifold && degenerateTriangles === 0 && nonFiniteVertexCount === 0,
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
      foldedPairCount,
      degenerateTriangles,
      warnings,
      eulerCharacteristic,
    };
  }
}
