import { GeometryGenerator } from '../src/services/geometryGenerator';
import { DEFAULT_SETTINGS } from '../src/constants/presets';
import type { LithophaneSettings } from '../src/types/lithophane';

function analyze(shape: LithophaneSettings['shape'], cols = 48, rows = 32) {
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const v = r / (rows - 1);
      // A bright circle in the middle so thickness varies.
      const dx = u - 0.5;
      const dy = v - 0.5;
      grid[r * cols + c] = Math.max(0, 1 - Math.hypot(dx, dy) * 2.2);
    }
  }
  const settings: LithophaneSettings = {
    ...DEFAULT_SETTINGS,
    shape,
    width: 120,
    height: 90,
    hasFrame: true,
  };
  const geom = GeometryGenerator.generateMesh(grid, cols, rows, settings);
  const idx = geom.indices;
  const v = geom.vertices;
  const uv = geom.uvs!;
  const th = geom.thicknesses!;
  const n = geom.normals;
  const numTris = idx.length / 3;

  let seamTris = 0;
  let largeFront = 0;
  let frontArea = 0;
  let backArea = 0;
  const samples: string[] = [];

  for (let t = 0; t < numTris; t++) {
    const i0 = idx[t * 3];
    const i1 = idx[t * 3 + 1];
    const i2 = idx[t * 3 + 2];
    const ax = v[i0 * 3], ay = v[i0 * 3 + 1], az = v[i0 * 3 + 2];
    const bx = v[i1 * 3], by = v[i1 * 3 + 1], bz = v[i1 * 3 + 2];
    const cx = v[i2 * 3], cy = v[i2 * 3 + 1], cz = v[i2 * 3 + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let fnx = aby * acz - abz * acy;
    let fny = abz * acx - abx * acz;
    let fnz = abx * acy - aby * acx;
    const area2 = Math.hypot(fnx, fny, fnz);
    if (area2 < 1e-8) continue;
    fnx /= area2; fny /= area2; fnz /= area2;
    const u0 = uv[i0 * 2], u1 = uv[i1 * 2], u2 = uv[i2 * 2];
    const span = Math.max(u0, u1, u2) - Math.min(u0, u1, u2);
    const wraps = span > 0.5;
    if (wraps) seamTris++;
    const area = area2 / 2;
    if (fny > 0.5) {
      frontArea += area;
      if (area > 20) {
        largeFront++;
        if (samples.length < 4) {
          const v0 = uv[i0 * 2 + 1], v1 = uv[i1 * 2 + 1], v2 = uv[i2 * 2 + 1];
          samples.push(
            `area=${area.toFixed(1)} ny=${fny.toFixed(3)} u=[${u0.toFixed(3)},${u1.toFixed(3)},${u2.toFixed(3)}] v=[${v0.toFixed(3)},${v1.toFixed(3)},${v2.toFixed(3)}] th=[${th[i0].toFixed(2)},${th[i1].toFixed(2)},${th[i2].toFixed(2)}] z=[${az.toFixed(1)},${bz.toFixed(1)},${cz.toFixed(1)}]`
          );
        }
      }
    } else if (fny < -0.5) {
      backArea += area;
    }
  }

  const thMin = Math.min(...geom.thicknessGrid!);
  const thMax = Math.max(...geom.thicknessGrid!);
  console.log(`\n=== ${shape} ===`);
  console.log(`tris=${numTris} verts=${v.length / 3} seamTris=${seamTris} largeFront=${largeFront}`);
  console.log(`frontArea=${frontArea.toFixed(0)} backArea=${backArea.toFixed(0)} gridTh=${thMin.toFixed(2)}..${thMax.toFixed(2)}`);
  console.log(`bbox y=${geom.boundingBox.min[1].toFixed(2)}..${geom.boundingBox.max[1].toFixed(2)} z=${geom.boundingBox.min[2].toFixed(2)}..${geom.boundingBox.max[2].toFixed(2)}`);
  console.log(`gridRes=${geom.gridResolution.cols}x${geom.gridResolution.rows} thicknessGrid=${geom.thicknessGrid!.length}`);
  for (const s of samples) console.log(' ', s);
  // How many front-facing triangles would sample a collapsed UV?
  let collapsed = 0;
  let frontTris = 0;
  for (let t = 0; t < numTris; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const ay = v[i0 * 3 + 1], by = v[i1 * 3 + 1], cy = v[i2 * 3 + 1];
    const az = v[i0 * 3 + 2], bz = v[i1 * 3 + 2], cz = v[i2 * 3 + 2];
    const abx = v[i1 * 3] - v[i0 * 3], aby = by - ay, abz = bz - az;
    const acx = v[i2 * 3] - v[i0 * 3], acy = cy - ay, acz = cz - az;
    let fny = abz * acx - abx * acz;
    const fnx = aby * acz - abz * acy;
    const fnz = abx * acy - aby * acx;
    const len = Math.hypot(fnx, fny, fnz);
    if (len < 1e-8) continue;
    fny /= len;
    if (fny < 0.5) continue;
    frontTris++;
    const u0 = uv[i0 * 2], u1 = uv[i1 * 2], u2 = uv[i2 * 2];
    const wraps = Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5;
    if (!wraps) continue;
    const rewritten = [u0, u1, u2].map((u) => (u < 0.25 ? 1 : u));
    const rspan = Math.max(...rewritten) - Math.min(...rewritten);
    if (rspan < 0.05) collapsed++;
  }
  console.log(`frontTris=${frontTris} collapsedUV=${collapsed}`);
  const mid = Math.floor(cols / 2);
  const colTh: number[] = [];
  for (let r = 0; r < rows; r++) colTh.push(geom.thicknessGrid![r * cols + mid]);
  console.log(
    `midCol th ${Math.min(...colTh).toFixed(2)}..${Math.max(...colTh).toFixed(2)} first=${colTh[0].toFixed(2)} mid=${colTh[Math.floor(rows / 2)].toFixed(2)} last=${colTh[rows - 1].toFixed(2)}`
  );
  void n;
}

analyze('flat');
analyze('curved');
analyze('cube');
analyze('curved', 120, 80);
