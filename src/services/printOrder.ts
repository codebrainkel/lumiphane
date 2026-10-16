/**
 * Treatstock handoff helpers. No secrets and no process.env reads:
 * the private key stays in the server router.
 */

export const TREATSTOCK_API_ORIGIN = 'https://www.treatstock.com';
// Master flat STLs are about 50–90 MB and a default cylinder is about 130 MB.
export const MAX_STL_BYTES = 160 * 1024 * 1024;
export const CHECKOUT_TTL_HOURS = 24;

const LITHO_NOTE =
  'Lumiphane lithophane. Units are millimeters. Please print in white PLA or white resin with solid (100%) infill so the photo shows when backlit.';

export interface TreatstockOffer {
  materialGroup: string;
  color: string;
  price: number | null;
  url: string;
}

export interface PrintCheckout {
  checkoutUrl: string;
  widgetUrl: string | null;
  packId: number;
  material: string | null;
  color: string | null;
  price: number | null;
  expiresInHours: number;
}

export type PrintOrderResult =
  | ({ ok: true } & PrintCheckout)
  | { ok: false; status: number; message: string };

const PLACEHOLDER_KEYS = new Set([
  'your_key',
  'your-key',
  'changeme',
  'replace_me',
  'todo',
  'my_treatstock_private_key',
  'treatstock_private_key',
]);

export function isPrintOrderingConfigured(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 8) return false;
  return !PLACEHOLDER_KEYS.has(trimmed.toLowerCase());
}

export function sanitizeModelFilename(name: string | undefined): string {
  const base = (name || 'lithophane')
    .replace(/\.stl$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${base || 'lithophane'}.stl`;
}

export function isTreatstockHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (host === 'treatstock.com' || host.endsWith('.treatstock.com'))
    );
  } catch {
    return false;
  }
}

export function redactSecrets(text: string): string {
  return text.replace(/private-key=[^&\s"']+/gi, 'private-key=redacted');
}

export function inspectBinaryStl(bytes: Uint8Array): { ok: true; triangles: number } | { ok: false; message: string } {
  if (bytes.byteLength < 84) {
    return { ok: false, message: 'The model file is not a binary STL.' };
  }
  if (bytes.byteLength > MAX_STL_BYTES) {
    return {
      ok: false,
      message: 'This lithophane is too large to upload. Lower the quality tier, then order again, or export the STL.',
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true);
  if (triangles <= 0) {
    return { ok: false, message: 'The STL does not contain any triangles.' };
  }
  const expected = 84 + triangles * 50;
  if (expected !== bytes.byteLength) {
    return { ok: false, message: 'The STL length does not match its triangle count.' };
  }
  return { ok: true, triangles };
}

export function selectTreatstockCheckout(
  fallbackUrl: string,
  offers: TreatstockOffer[]
): { url: string; material: string | null; color: string | null; price: number | null } {
  const ranked = offers
    .filter((offer) => isTreatstockHttpsUrl(offer.url))
    .map((offer) => ({ offer, rank: offerRank(offer) }))
    .filter((item) => item.rank < 4)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const ap = a.offer.price ?? Number.POSITIVE_INFINITY;
      const bp = b.offer.price ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });

  const best = ranked[0]?.offer;
  if (!best) {
    return { url: fallbackUrl, material: null, color: null, price: null };
  }
  return {
    url: best.url,
    material: best.materialGroup || null,
    color: best.color || null,
    price: best.price,
  };
}

function offerRank(offer: TreatstockOffer): number {
  const color = offer.color.toLowerCase();
  const material = offer.materialGroup.toLowerCase();
  const white = color === 'white' || color.includes('white');
  const pla = material.includes('pla');
  const resin = material.includes('resin');
  if (white && pla) return 0;
  if (white && resin) return 1;
  if (white) return 2;
  if (pla) return 3;
  return 4;
}

function apiUrl(origin: string, pathname: string, key: string, query?: Record<string, string>): string {
  const url = new URL(pathname, origin);
  url.searchParams.set('private-key', key);
  if (query) {
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function errorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  if (!record) return fallback;
  if (typeof record.message === 'string' && record.message.trim()) {
    return redactSecrets(record.message.trim());
  }
  const errors = asRecord(record.errors);
  if (errors) {
    const parts: string[] = [];
    for (const value of Object.values(errors)) {
      if (typeof value === 'string') parts.push(value);
      else if (Array.isArray(value)) parts.push(value.map(String).join(' '));
    }
    if (parts.length) return redactSecrets(parts.join(' '));
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: redactSecrets(text.slice(0, 280)) };
  }
}

function extractOffers(payload: unknown): TreatstockOffer[] | 'pending' {
  const record = asRecord(payload);
  if (record && (record.reason === 'not_calculated_yet' || record.success === false && record.reason === 'not_calculated_yet')) {
    return 'pending';
  }
  const list = Array.isArray(payload)
    ? payload
    : record && Array.isArray(record.pricesInfo)
      ? record.pricesInfo
      : null;
  if (!list) return [];
  const offers: TreatstockOffer[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row || typeof row.url !== 'string') continue;
    const price = typeof row.price === 'number' ? row.price : Number(row.price);
    offers.push({
      materialGroup: typeof row.materialGroup === 'string' ? row.materialGroup : '',
      color: typeof row.color === 'string' ? row.color : '',
      price: Number.isFinite(price) ? price : null,
      url: row.url,
    });
  }
  return offers;
}

export async function prepareTreatstockCheckout(options: {
  apiKey: string;
  fileBytes: Uint8Array;
  filename: string;
  country?: string;
  clientIp?: string;
  origin?: string;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}): Promise<PrintOrderResult> {
  const inspected = inspectBinaryStl(options.fileBytes);
  if (!inspected.ok) {
    return { ok: false, status: inspected.message.includes('too large') ? 413 : 400, message: inspected.message };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = options.origin ?? TREATSTOCK_API_ORIGIN;
  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const filename = sanitizeModelFilename(options.filename);

  const form = new FormData();
  const fileBuffer = new ArrayBuffer(options.fileBytes.byteLength);
  new Uint8Array(fileBuffer).set(options.fileBytes);
  form.append('files[]', new Blob([fileBuffer], { type: 'application/octet-stream' }), filename);
  form.append('description', LITHO_NOTE);
  if (options.clientIp) form.append('location[ip]', options.clientIp);
  else if (options.country) form.append('location[country]', options.country.toUpperCase());

  let uploadPayload: unknown;
  let uploadStatus = 0;
  try {
    const upload = await fetchImpl(apiUrl(origin, '/api/v2/printable-packs', options.apiKey), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    uploadStatus = upload.status;
    uploadPayload = await readJson(upload);
  } catch {
    return {
      ok: false,
      status: 502,
      message: 'Treatstock could not be reached. Export the STL and try the order again in a moment.',
    };
  }

  const uploaded = asRecord(uploadPayload);
  const packId = Number(uploaded?.id);
  const redir = typeof uploaded?.redir === 'string' ? uploaded.redir : '';
  const widgetUrl = typeof uploaded?.widgetUrl === 'string' ? uploaded.widgetUrl : null;

  if (!uploadStatus || uploadStatus >= 400 || !Number.isFinite(packId) || packId <= 0 || !redir) {
    const status = uploadStatus === 401 || uploadStatus === 403 ? 502 : 502;
    const fallback =
      uploadStatus === 401 || uploadStatus === 403
        ? 'Treatstock rejected the API key. Check TREATSTOCK_PRIVATE_KEY on the server.'
        : 'Treatstock did not accept this model.';
    return { ok: false, status, message: errorMessage(uploadPayload, fallback) };
  }

  if (!isTreatstockHttpsUrl(redir)) {
    return { ok: false, status: 502, message: 'Treatstock returned an unexpected checkout link.' };
  }

  try {
    await fetchImpl(apiUrl(origin, `/api/v2/printable-packs/${packId}`, options.apiKey), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'scaleUnit=mm',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // The generic checkout link still opens the model. Millimeter scale is retried by Treatstock's parser.
  }

  const priceQuery: Record<string, string> = {
    printablePackId: String(packId),
    printerMaterialGroup: 'PLA',
    printerColor: 'White',
  };
  if (options.clientIp) priceQuery['location[ip]'] = options.clientIp;
  else if (options.country) priceQuery['location[country]'] = options.country.toUpperCase();

  let offers: TreatstockOffer[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const priced = await fetchImpl(apiUrl(origin, '/api/v2/printable-pack-costs/', options.apiKey, priceQuery), {
        signal: AbortSignal.timeout(20000),
      });
      const payload = await readJson(priced);
      const extracted = extractOffers(payload);
      if (extracted === 'pending') {
        await wait(700);
        continue;
      }
      offers = extracted;
      break;
    } catch {
      break;
    }
  }

  const selected = selectTreatstockCheckout(redir, offers);
  if (!isTreatstockHttpsUrl(selected.url)) {
    return { ok: false, status: 502, message: 'Treatstock returned an unexpected checkout link.' };
  }

  return {
    ok: true,
    checkoutUrl: selected.url,
    widgetUrl: widgetUrl && isTreatstockHttpsUrl(widgetUrl) ? widgetUrl : null,
    packId,
    material: selected.material,
    color: selected.color,
    price: selected.price,
    expiresInHours: CHECKOUT_TTL_HOURS,
  };
}
