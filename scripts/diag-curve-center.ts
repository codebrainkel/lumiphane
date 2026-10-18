import { GeometryGenerator } from '../src/services/geometryGenerator';
import { DEFAULT_SETTINGS } from '../src/constants/presets';
import type { LithophaneSettings } from '../src/types/lithophane';

function run(cols: number, rows: number) {
  const grid = new Float32Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = (i % 17) / 16;
  const settings: LithophaneSettings = {
    ...DEFAULT_SETTINGS,
    shape: 'curved',
    width: 120,
    height: 90,
    hasFrame: true,
    curveAngle: 75,
  };
  const geom = GeometryGenerator.generateMesh(grid, cols, rows, settings);
  const v = geom.vertices;
  const idx = geom.indices;
  const curveRad = (75 * Math.PI) / 180;
  const R = 120 / curveRad;
  const outer = 3.4;
  const radius = R + outer;
  const cy = -R;

  let outward = 0;
  let inward = 0;
  let maxChord = 0;
  let worst: string | null = null;
  const near: string[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const ids = [idx[t], idx[t + 1], idx[t + 2]];
    const p = ids.map((id) => [v[id * 3], v[id * 3 + 1], v[id * 3 + 2]]);
    const ab = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const ac = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-8) continue;
    const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
    const cyy = (p[0][1] + p[1][1] + p[2][1]) / 3;
    const radial = Math.hypot(cx, cyy - cy);
    const onOuter = Math.abs(radial - radius) < 0.4;
    if (!onOuter) continue;
    if (ny > 0) outward++;
    else inward++;
    const xs = p.map((q) => q[0]);
    const span = Math.max(...xs) - Math.min(...xs);
    if (span > maxChord) {
      maxChord = span;
      worst = `span=${span.toFixed(2)} x=${xs.map((x) => x.toFixed(2)).join(',')} ny=${(ny / len).toFixed(2)} z=${p.map((q) => q[2].toFixed(1)).join(',')}`;
    }
    if (Math.abs(cx) < 1.2 && near.length < 8) {
      const rads = p.map((q) => Math.hypot(q[0], q[1] - cy));
      near.push(
        `cx=${cx.toFixed(2)} span=${span.toFixed(2)} ny=${(ny / len).toFixed(3)} rad=${rads.map((r) => r.toFixed(3)).join(',')} z=${p.map((q) => q[2].toFixed(1)).join(',')}`
      );
    }
  }
  console.log(`\ncols=${cols} outward=${outward} inwardOnOuter=${inward} maxOuterChord=${maxChord.toFixed(2)}mm`);
  console.log(' widest', worst);
  for (const line of near) console.log(' ', line);
}

function deviations(cols: number, rows: number) {
  const grid = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const v = r / (rows - 1);
      grid[r * cols + c] = Math.abs(u - 0.5) < 0.02 ? 1 : 0.2;
    }
  }
  const settings: LithophaneSettings = {
    ...DEFAULT_SETTINGS,
    shape: 'curved',
    width: 120,
    height: 90,
    hasFrame: true,
  };
  const geom = GeometryGenerator.generateMesh(grid, cols, rows, settings);
  const v = geom.vertices;
  const uv = geom.uvs!;
  const idx = geom.indices;
  const curveRad = (75 * Math.PI) / 180;
  const R = 120 / curveRad;
  const radius = R + 3.4;
  let offArc = 0;
  let uvJump = 0;
  const samples: string[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const ids = [idx[t], idx[t + 1], idx[t + 2]];
    const p = ids.map((id) => ({
      x: v[id * 3],
      y: v[id * 3 + 1],
      z: v[id * 3 + 2],
      u: uv[id * 2],
      vv: uv[id * 2 + 1],
      rad: Math.hypot(v[id * 3], v[id * 3 + 1] + R),
    }));
    const cx = (p[0].x + p[1].x + p[2].x) / 3;
    if (Math.abs(cx) > 2) continue;
    const on = p.filter((q) => Math.abs(q.rad - radius) < 0.15);
    if (on.length === 0) continue;
    if (on.length < 3) {
      offArc++;
      if (offArc <= 12) {
        console.log(
          ' mixed',
          p
            .map(
              (q) =>
                `(x=${q.x.toFixed(2)} z=${q.z.toFixed(1)} r=${q.rad.toFixed(2)} u=${q.u.toFixed(3)} v=${q.vv.toFixed(2)})`
            )
            .join(' ')
        );
      }
    }
    const us = p.map((q) => q.u);
    const span = Math.max(...us) - Math.min(...us);
    if (span > 0.05) {
      uvJump++;
      if (samples.length < 6) {
        samples.push(
          `UVspan=${span.toFixed(3)} u=${us.map((u) => u.toFixed(3)).join(',')} z=${p.map((q) => q.z.toFixed(1)).join(',')} x=${p.map((q) => q.x.toFixed(2)).join(',')}`
        );
      }
    }
  }
  let tall = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const ids = [idx[t], idx[t + 1], idx[t + 2]];
    const p = ids.map((id) => ({
      x: v[id * 3],
      y: v[id * 3 + 1],
      z: v[id * 3 + 2],
      u: uv[id * 2],
      vv: uv[id * 2 + 1],
      rad: Math.hypot(v[id * 3], v[id * 3 + 1] + R),
    }));
    const cx = (p[0].x + p[1].x + p[2].x) / 3;
    const zs = p.map((q) => q.z);
    if (Math.abs(cx) > 0.4) continue;
    if (Math.max(...zs) - Math.min(...zs) < 40) continue;
    tall++;
    if (tall <= 6) {
      console.log(
        ' tall',
        p.map((q) => `(x=${q.x.toFixed(2)} y=${q.y.toFixed(2)} z=${q.z.toFixed(1)} r=${q.rad.toFixed(2)} v=${q.vv.toFixed(2)})`).join(' ')
      );
    }
  }
  console.log('tall center tris', tall);
  console.log(`cols=${cols} center tris off-arc=${offArc} wideUV=${uvJump}`);
  for (const s of samples) console.log(' ', s);
}

deviations(600, 200);
