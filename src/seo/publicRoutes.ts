/**
 * Paths that serve the generator SPA shell.
 *
 * The production server returns the app only for these paths. Landing guides
 * are separate HTML files and must stay off this list: a missing guide would
 * otherwise fall through to the generator and look like a duplicate homepage.
 */
export const PUBLIC_APP_ROUTES = ['/'] as const;

export const SITE_ORIGIN = 'https://lumiphane.com';

/**
 * Educational pages. The homepage stays the lithophane generator, so there is
 * no /lithophane-generator/ URL competing with it.
 */
export const LANDING_PAGE_ROUTES = [
  '/how-to-make-a-lithophane/',
  '/photo-to-lithophane/',
  '/lithophane-lamp/',
  '/3d-printed-lithophane/',
  '/bambu-studio-lithophane/',
  '/lithophane-settings/',
] as const;

/** Legal / static HTML under public/ (not guide landing pages). */
export const LEGAL_PAGE_ROUTES = ['/privacy/'] as const;

export const INDEXABLE_ROUTES = ['/', ...LANDING_PAGE_ROUTES, ...LEGAL_PAGE_ROUTES] as const;

const CANONICAL_CONTENT_ROUTES = [
  ...LANDING_PAGE_ROUTES,
  ...LEGAL_PAGE_ROUTES,
] as const;

/** 301 target for a non-canonical content URL, or null when the path is already fine. */
export function landingRedirectTarget(pathname: string): string | null {
  const path = pathname.split('?')[0] || '/';
  if ((CANONICAL_CONTENT_ROUTES as readonly string[]).includes(path)) return null;
  if (path.endsWith('/index.html')) {
    const cleaned = path.slice(0, -'index.html'.length);
    if ((CANONICAL_CONTENT_ROUTES as readonly string[]).includes(cleaned)) return cleaned;
  }
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  if (withSlash !== path && (CANONICAL_CONTENT_ROUTES as readonly string[]).includes(withSlash)) {
    return withSlash;
  }
  return null;
}
