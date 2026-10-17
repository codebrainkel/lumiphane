import { PUBLIC_APP_ROUTES, SITE_ORIGIN } from './publicRoutes';

export function sitemapLastmod(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function absoluteUrl(route: string): string {
  if (route === '/') return `${SITE_ORIGIN}/`;
  const path = route.startsWith('/') ? route : `/${route}`;
  return `${SITE_ORIGIN}${path}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Sitemap XML for the public app routes. `lastmod` is a YYYY-MM-DD build date. */
export function renderSitemap(
  routes: readonly string[] = PUBLIC_APP_ROUTES,
  lastmod: string = sitemapLastmod()
): string {
  const urls = routes
    .map((route) => {
      const loc = escapeXml(absoluteUrl(route));
      const modified = escapeXml(lastmod);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${modified}</lastmod>\n  </url>`;
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    '</urlset>\n'
  );
}
