/**
 * Beer–Lambert extinction of white PLA.
 * Transmitted light is T = exp(-k · thickness). The mesh and the 3D preview
 * share this value so the on-screen backlight matches the print.
 */
export const WHITE_PLA_EXTINCTION_PER_MM = 1.75;

/** IEC 61966-2-1 sRGB electro-optical transfer, clamped to [0, 1]. */
export function srgbToLinear(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Inverse of {@link srgbToLinear}. */
export function linearToSrgb(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Wall thickness whose transmitted light tracks linearized sRGB luminance.
 *
 * T(t) = exp(-k·t) is interpolated from T(max) at black to T(min) at white:
 *   Tmin = exp(-k·(max−min))
 *   t = min − ln(Tmin + (1−Tmin)·srgbToLinear(L)) / k
 *
 * Dark pixels are thick, bright pixels are thin, and both ends land on the
 * requested limits.
 */
export function thicknessForLuminance(
  luminance: number,
  minThicknessMm: number,
  maxThicknessMm: number,
  k: number = WHITE_PLA_EXTINCTION_PER_MM
): number {
  const minTh = minThicknessMm;
  const maxTh = Math.max(minTh, maxThicknessMm);
  const delta = maxTh - minTh;
  if (!(k > 0) || delta < 1e-9) return minTh;

  const linear = srgbToLinear(luminance);
  const tFloor = Math.exp(-k * delta);
  const transmitted = tFloor + (1 - tFloor) * linear;
  const thickness = minTh - Math.log(Math.max(transmitted, 1e-18)) / k;
  if (!Number.isFinite(thickness)) return linear >= 1 ? minTh : maxTh;
  return Math.min(maxTh, Math.max(minTh, thickness));
}

/**
 * Transmission T = exp(-k·t), normalized between the dark and bright walls
 * and encoded back to sRGB. Inverts {@link thicknessForLuminance}.
 */
export function transmissionToSrgb(
  thicknessMm: number,
  minThicknessMm: number,
  maxThicknessMm: number,
  k: number = WHITE_PLA_EXTINCTION_PER_MM
): number {
  const minTh = minThicknessMm;
  const maxTh = Math.max(minTh, maxThicknessMm);
  const transmission = Math.exp(-k * thicknessMm);
  const bright = Math.exp(-k * minTh);
  const dark = Math.exp(-k * maxTh);
  const span = bright - dark;
  const linear = span > 1e-12 ? (transmission - dark) / span : 0;
  return linearToSrgb(linear);
}
