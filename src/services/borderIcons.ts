import { BorderIcon, LithophaneShape } from '../types/lithophane';

/** Width applied when an icon is turned on, wide enough to read without a heavy frame. */
export const BORDER_ICON_MIN_WIDTH_MM = 5;

const FEATHER_MM = 0.12;
const MAX_ICONS = 64;

type Point = readonly [number, number];

interface PlacedIcon {
  x: number;
  y: number;
  tx: number;
  ty: number;
  ox: number;
  oy: number;
  wrap: number;
}

export interface BorderIconFieldOptions {
  kind: BorderIcon;
  /** 'rect' walks all four edges. 'loop' walks the top and bottom rims of a cylinder or cube. */
  layout: 'rect' | 'loop';
  /** Panel width, or the perimeter length when layout is 'loop'. */
  widthMm: number;
  heightMm: number;
  frameWidthMm: number;
  /** Arc length where one icon is centered. Loops use the front-center of the rim. */
  alignArcMm?: number;
  /** Cube face width. Icons that would crease over a corner are left off. */
  cornerPeriodMm?: number;
}

export function maxBorderWidthMm(
  shape: LithophaneShape,
  panelWidthMm: number,
  panelHeightMm: number
): number {
  const span =
    shape === 'cylinder' || shape === 'cube'
      ? panelHeightMm
      : Math.min(panelWidthMm, panelHeightMm);
  const limit = Math.min(16, Math.max(4, span * 0.35));
  return Math.round(limit * 2) / 2;
}

export function clampBorderWidthMm(
  shape: LithophaneShape,
  panelWidthMm: number,
  panelHeightMm: number,
  requestedMm: number
): number {
  return Math.min(maxBorderWidthMm(shape, panelWidthMm, panelHeightMm), Math.max(1.5, requestedMm));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function coverageFromSdf(sdf: number): number {
  return 1 - smoothstep(-FEATHER_MM, FEATHER_MM, sdf);
}

function mod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function wrapDelta(delta: number, period: number): number {
  if (period <= 0) return delta;
  const half = period / 2;
  return ((((delta + half) % period) + period) % period) - half;
}

function sdPolygon(s: number, t: number, verts: readonly Point[]): number {
  const n = verts.length;
  let dist = Infinity;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = verts[j][0];
    const ay = verts[j][1];
    const bx = verts[i][0];
    const by = verts[i][1];
    const ex = bx - ax;
    const ey = by - ay;
    const wx = s - ax;
    const wy = t - ay;
    const len2 = ex * ex + ey * ey;
    const h = len2 > 1e-12 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / len2)) : 0;
    const dx = wx - ex * h;
    const dy = wy - ey * h;
    const d = Math.hypot(dx, dy);
    if (d < dist) dist = d;
    if ((ay > t) !== (by > t) && s < ((bx - ax) * (t - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside ? -dist : dist;
}

function buildHeart(reach: number): Point[] {
  const n = 56;
  const raw: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const sin = Math.sin(theta);
    const x = 16 * sin * sin * sin;
    const yLobesOut =
      13 * Math.cos(theta) -
      5 * Math.cos(2 * theta) -
      2 * Math.cos(3 * theta) -
      Math.cos(4 * theta);
    // Lobes face out of the frame. The tip points back toward the photo.
    raw.push([x, yLobesOut]);
  }

  let minS = Infinity;
  let maxS = -Infinity;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const [s, t] of raw) {
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const centerS = (minS + maxS) / 2;
  const centerT = (minT + maxT) / 2;
  const scale = reach / Math.max((maxS - minS) / 2, (maxT - minT) / 2);
  return raw.map(([s, t]) => [(s - centerS) * scale, (t - centerT) * scale]);
}

function buildStar(reach: number): Point[] {
  const verts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = (i % 2 === 0 ? 1 : 0.4) * reach;
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    verts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return verts;
}

const HEART_UNIT = buildHeart(1);
const STAR_UNIT = buildStar(1);

function sdHeart(s: number, t: number, reach: number): number {
  return sdPolygon(s / reach, t / reach, HEART_UNIT) * reach;
}

function sdStar(s: number, t: number, reach: number): number {
  return sdPolygon(s / reach, t / reach, STAR_UNIT) * reach;
}

/** Dog bone lying along the border. +t points out of the frame. */
function sdBone(s: number, t: number, reach: number): number {
  const knobR = reach * 0.3;
  const cx = reach - knobR;
  const cy = knobR * 0.72;
  const dKnobs = Math.hypot(Math.abs(s) - cx, Math.abs(t) - cy) - knobR;
  const barR = knobR * 0.62;
  const barEnd = cx - knobR * 0.2;
  const clampedS = Math.max(-barEnd, Math.min(barEnd, s));
  const dBar = Math.hypot(s - clampedS, t) - barR;
  return Math.min(dKnobs, dBar);
}

function iconSdf(kind: Exclude<BorderIcon, 'none'>, alongMm: number, outwardMm: number, reachMm: number): number {
  if (kind === 'heart') return sdHeart(alongMm, outwardMm, reachMm);
  if (kind === 'bone') return sdBone(alongMm, outwardMm, reachMm);
  return sdStar(alongMm, outwardMm, reachMm);
}

/** 1 inside the motif, 0 outside. +outwardMm points out of the frame, +alongMm follows the border. */
export function borderIconCoverage(
  kind: Exclude<BorderIcon, 'none'>,
  alongMm: number,
  outwardMm: number,
  reachMm: number
): number {
  return coverageFromSdf(iconSdf(kind, alongMm, outwardMm, reachMm));
}

function pointOnRect(arc: number, width: number, height: number, inset: number, perimeter: number): PlacedIcon {
  let cursor = mod(arc, perimeter);
  const innerW = width - 2 * inset;
  const innerH = height - 2 * inset;
  const segments = [
    { len: innerW, x: inset, y: inset, tx: 1, ty: 0, ox: 0, oy: -1 },
    { len: innerH, x: width - inset, y: inset, tx: 0, ty: 1, ox: 1, oy: 0 },
    { len: innerW, x: width - inset, y: height - inset, tx: -1, ty: 0, ox: 0, oy: 1 },
    { len: innerH, x: inset, y: height - inset, tx: 0, ty: -1, ox: -1, oy: 0 },
  ];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (cursor <= seg.len || i === segments.length - 1) {
      const d = Math.max(0, Math.min(seg.len, cursor));
      return {
        x: seg.x + seg.tx * d,
        y: seg.y + seg.ty * d,
        tx: seg.tx,
        ty: seg.ty,
        ox: seg.ox,
        oy: seg.oy,
        wrap: 0,
      };
    }
    cursor -= seg.len;
  }
  return { x: inset, y: inset, tx: 1, ty: 0, ox: 0, oy: -1, wrap: 0 };
}

function pointOnLoop(arc: number, perimeter: number, y: number, outwardY: number): PlacedIcon {
  return {
    x: mod(arc, perimeter),
    y,
    tx: 1,
    ty: 0,
    ox: 0,
    oy: outwardY,
    wrap: perimeter,
  };
}

/**
 * Motif cut into the centerline of the border.
 * The sampler returns how many millimetres to remove from the border thickness.
 */
export function createBorderIconField(options: BorderIconFieldOptions): (xMm: number, yMm: number) => number {
  const kind = options.kind;
  if (kind === 'none') return () => 0;

  const width = options.widthMm;
  const height = options.heightMm;
  const frameW = options.frameWidthMm;
  const inset = frameW / 2;
  const perimeter =
    options.layout === 'rect' ? 2 * (width - frameW + (height - frameW)) : width;

  if (perimeter < 8 || frameW < 1.5 || height < 8) return () => 0;

  // Keep the motif in the middle of the band so the frame shows around it.
  let reach = frameW * 0.22;
  const minGap = 1.35;
  let count = Math.round(perimeter / (frameW * 2.4));
  if (count < 4) count = 4;
  if (count % 2 === 1) count += 1;
  if (count > MAX_ICONS) count = MAX_ICONS;
  let step = perimeter / count;
  while (count > 4 && step < reach * 2 * minGap) {
    count -= 2;
    step = perimeter / count;
  }
  if (step < reach * 2 * minGap) reach = step / (2 * minGap);
  if (reach < 0.45) return () => 0;

  const align =
    options.layout === 'rect' ? (width - frameW) / 2 : options.alignArcMm ?? 0;
  const cornerPeriod = options.cornerPeriodMm ?? 0;
  const reliefMm = Math.min(1, Math.max(0.55, frameW * 0.11));
  const reachLimit = reach + FEATHER_MM;
  const reachLimitSq = reachLimit * reachLimit;
  const icons: PlacedIcon[] = [];

  for (let i = 0; i < count; i++) {
    const arc = align + i * step;
    if (cornerPeriod > 0) {
      const around = mod(arc, cornerPeriod);
      const distCorner = Math.min(around, cornerPeriod - around);
      if (distCorner < reach + FEATHER_MM) continue;
    }
    if (options.layout === 'rect') {
      icons.push(pointOnRect(arc, width, height, inset, perimeter));
    } else {
      icons.push(pointOnLoop(arc, perimeter, inset, -1));
      icons.push(pointOnLoop(arc, perimeter, height - inset, 1));
    }
  }

  if (icons.length === 0) return () => 0;

  return (xMm: number, yMm: number) => {
    if (options.layout === 'rect') {
      const distOuter = Math.min(xMm, yMm, width - xMm, height - yMm);
      if (distOuter > frameW + 0.05 || distOuter < -0.05) return 0;
    } else if (yMm > inset + reachLimit && yMm < height - inset - reachLimit) {
      return 0;
    }

    let best = 0;
    for (let i = 0; i < icons.length; i++) {
      const icon = icons[i];
      const dx = wrapDelta(xMm - icon.x, icon.wrap);
      const dy = yMm - icon.y;
      if (dx * dx + dy * dy > reachLimitSq) continue;
      const along = dx * icon.tx + dy * icon.ty;
      const outward = dx * icon.ox + dy * icon.oy;
      const cover = coverageFromSdf(iconSdf(kind, along, outward, reach));
      if (cover > best) best = cover;
      if (best > 0.995) break;
    }
    return best * reliefMm;
  };
}
