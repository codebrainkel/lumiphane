import assert from 'node:assert/strict';
import { LANDING_PAGES } from './pages';
import { renderLandingPage } from './renderPage';
import { escapeHtml } from './html';
import { INDEXABLE_ROUTES, LANDING_PAGE_ROUTES, PUBLIC_APP_ROUTES, SITE_ORIGIN } from '../publicRoutes';
import { renderSitemap } from '../sitemap';

const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

check(new Set(LANDING_PAGES.map((page) => page.path)).size === LANDING_PAGES.length, 'paths unique');
check(
  LANDING_PAGES.map((page) => page.path).slice().sort().join() === [...LANDING_PAGE_ROUTES].slice().sort().join(),
  'catalog paths match LANDING_PAGE_ROUTES'
);

for (const route of LANDING_PAGE_ROUTES) {
  check(!(PUBLIC_APP_ROUTES as readonly string[]).includes(route), `${route} must not be an SPA route`);
}

const titles = new Set<string>();
const descriptions = new Set<string>();
const h1s = new Set<string>();

for (const page of LANDING_PAGES) {
  check(page.path.endsWith('/'), `${page.path} trailing slash`);
  check(!titles.has(page.title), `duplicate title ${page.title}`);
  check(!descriptions.has(page.description), `duplicate description`);
  check(!h1s.has(page.h1), `duplicate h1 ${page.h1}`);
  titles.add(page.title);
  descriptions.add(page.description);
  h1s.add(page.h1);
  check(page.title.length <= 60, `${page.path} title length ${page.title.length}`);
  check(
    page.description.length >= 110 && page.description.length <= 165,
    `${page.path} description length ${page.description.length}: ${page.description}`
  );
  check(!page.h1.toLowerCase().includes('lithophane generator'), `${page.path} h1 competes with the homepage`);
  check(!/\/lithophane-generator\/?/.test(page.path), 'no competing generator URL');

  const ids = page.sections.filter((section) => section.kind !== 'note').map((section) => section.id);
  check(new Set(ids).size === ids.length, `${page.path} duplicate section ids`);
  for (const id of ids) check(/^[a-z0-9-]+$/.test(id), `${page.path} bad id ${id}`);

  for (const section of page.sections) {
    if (section.kind === 'table') {
      for (const row of section.rows) {
        check(row.length === section.columns.length, `${page.path} table row width`);
      }
    }
  }

  const html = renderLandingPage(page, LANDING_PAGES, '2026-10-21');
  const h1Count = html.match(/<h1>/g)?.length ?? 0;
  check(h1Count === 1, `${page.path} h1 count ${h1Count}`);
  check(html.includes(`<link rel="canonical" href="${SITE_ORIGIN}${page.path}">`), `${page.path} canonical`);
  check(html.includes(`property="og:image" content="${SITE_ORIGIN}/og-image.png"`), `${page.path} og:image`);
  check(html.includes(`name="twitter:image" content="${SITE_ORIGIN}/og-image.png"`), `${page.path} twitter:image`);
  check(html.includes('content="index, follow"'), `${page.path} indexable`);
  check(!html.includes('noindex'), `${page.path} noindex`);
  check(!html.includes('FAQPage'), `${page.path} unexpected FAQ schema`);
  check(html.includes('"@type":"WebPage"') || html.includes('"@type": "WebPage"'), `${page.path} WebPage schema`);
  check(html.includes('BreadcrumbList'), `${page.path} breadcrumbs`);
  check(html.includes('"@type":"Article"') || html.includes('"@type": "Article"'), `${page.path} Article schema`);
  check(!html.toLowerCase().includes('aggregateRating'), `${page.path} fake rating`);
  check(!/\bfree\b/i.test(html), `${page.path} unsubstantiated free claim`);
  for (const other of LANDING_PAGES) {
    check(html.includes(`href="${other.path}"`), `${page.path} missing link to ${other.path}`);
  }
  check(html.includes('href="/"'), `${page.path} missing generator link`);
  check(html.includes('href="/privacy/"'), `${page.path} missing privacy link`);
  check(html.includes('data-cta="hero"'), `${page.path} hero cta`);
  check(html.includes('data-cta="end"'), `${page.path} end cta`);
  check(html.includes('generator_cta_click'), `${page.path} analytics`);
}

const sitemap = renderSitemap(INDEXABLE_ROUTES, '2026-10-21');
for (const route of INDEXABLE_ROUTES) {
  const loc = route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`;
  check(sitemap.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);
}
check(sitemap.split('<loc>').length - 1 === INDEXABLE_ROUTES.length, 'sitemap url count');

check(escapeHtml('<script>') === '&lt;script&gt;', 'escape');
const hostile = renderLandingPage(
  {
    ...LANDING_PAGES[0],
    h1: '<script>alert(1)</script>',
    lede: 'See [home](/) and [bad](https://evil.example).',
  },
  LANDING_PAGES,
  '2026-10-21'
);
check(hostile.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'h1 escaped');
check(!hostile.includes('href="https://evil.example"'), 'external link dropped');
check(hostile.includes('href="/"'), 'safe link kept');

if (failures.length > 0) {
  console.error(failures.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`SEO checks passed for ${LANDING_PAGES.length} pages.`);
for (const page of LANDING_PAGES) {
  console.log(`${page.description.length}\t${page.title.length}\t${page.path}`);
}
