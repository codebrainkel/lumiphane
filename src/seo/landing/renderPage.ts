import { transmissionFigure, lampsFigure } from './figures';
import { escapeHtml, jsonLdScript, renderInline } from './html';
import type { LandingPage, Section } from './types';
import { SITE_ORIGIN } from '../publicRoutes';
import { sitemapLastmod } from '../sitemap';

const GA_ID = 'G-GPBEG86FZR';

function paragraphs(items: string[]): string {
  return items.map((item) => `<p>${renderInline(item)}</p>`).join('');
}

function sectionHtml(section: Section): string {
  if (section.kind === 'note') {
    return `<aside class="note">${paragraphs(section.paragraphs)}</aside>`;
  }

  const heading = `<h2 id="${escapeHtml(section.id)}">${escapeHtml(section.heading)}</h2>`;

  if (section.kind === 'prose') {
    const blocks = section.blocks
      .map((block) => {
        const h3 = block.heading ? `<h3>${escapeHtml(block.heading)}</h3>` : '';
        return `${h3}${paragraphs(block.paragraphs)}`;
      })
      .join('');
    return `${heading}<div class="prose">${blocks}</div>`;
  }

  if (section.kind === 'steps') {
    const intro = section.intro ? `<div class="prose">${paragraphs([section.intro])}</div>` : '';
    const items = section.steps
      .map(
        (step) =>
          `<li><h3>${escapeHtml(step.title)}</h3><div class="prose">${paragraphs([step.body])}</div></li>`
      )
      .join('');
    return `${heading}${intro}<ol class="steps">${items}</ol>`;
  }

  if (section.kind === 'cards') {
    const intro = section.intro ? `<div class="prose">${paragraphs([section.intro])}</div>` : '';
    const cards = section.cards
      .map(
        (card) =>
          `<article class="card"><h3>${escapeHtml(card.title)}</h3><div class="prose">${paragraphs([card.body])}</div></article>`
      )
      .join('');
    const columns = section.cards.length > 1 ? ' cols-2' : '';
    return `${heading}${intro}<div class="cards${columns}">${cards}</div>`;
  }

  if (section.kind === 'table') {
    const intro = section.intro ? `<div class="prose">${paragraphs([section.intro])}</div>` : '';
    const head = section.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('');
    const body = section.rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`
      )
      .join('');
    return `${heading}${intro}<div class="table-wrap"><table><caption>${escapeHtml(section.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  const titleId = `${section.id}-title`;
  const descId = `${section.id}-desc`;
  const svg = section.figure === 'transmission' ? transmissionFigure(titleId, descId) : lampsFigure(titleId, descId);
  return `${heading}<figure class="figure">${svg}<figcaption>${escapeHtml(section.caption)}</figcaption></figure>`;
}

function logo(): string {
  return `<svg viewBox="0 0 28 28" aria-hidden="true">
    <rect x="3" y="3" width="22" height="22" rx="4" stroke="#ffc21a" stroke-width="1.5" fill="none"/>
    <circle cx="14" cy="14" r="5" fill="#ffc21a"/>
    <path d="M7 19C9 17 11 18 14 16C17 14 19 15 21 13" stroke="#1a1204" stroke-width="1.25" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function structuredData(page: LandingPage, url: string, modified: string): string {
  return jsonLdScript({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        isPartOf: { '@type': 'WebSite', name: 'Lumiphane 3D', url: `${SITE_ORIGIN}/` },
        about: { '@type': 'Thing', name: 'Lithophane' },
        inLanguage: 'en',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Lumiphane', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: url },
        ],
      },
      {
        '@type': 'Article',
        headline: page.h1,
        description: page.description,
        mainEntityOfPage: url,
        inLanguage: 'en',
        dateModified: modified,
        author: { '@type': 'Organization', name: 'Lumiphane 3D', url: `${SITE_ORIGIN}/` },
        publisher: {
          '@type': 'Organization',
          name: 'Lumiphane 3D',
          url: `${SITE_ORIGIN}/`,
          logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon-512.png` },
        },
      },
    ],
  });
}

export function renderLandingPage(page: LandingPage, pages: readonly LandingPage[], modified = sitemapLastmod()): string {
  const url = `${SITE_ORIGIN}${page.path}`;
  const nav = [
    { href: '/', label: 'Generator' },
    ...pages.map((item) => ({ href: item.path, label: item.navLabel })),
  ];
  const navHtml = nav
    .map((item) => {
      const current = item.href === page.path ? ' aria-current="page"' : '';
      const cta = item.href === '/' ? ' data-cta="nav"' : '';
      return `<a href="${escapeHtml(item.href)}"${current}${cta}>${escapeHtml(item.label)}</a>`;
    })
    .join('');
  const tocItems = page.sections
    .filter((section) => section.kind !== 'note')
    .map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.heading)}</a></li>`)
    .join('');
  const toc = `${tocItems}<li><a href="#faq-heading">Questions</a></li>`;
  const body = page.sections.map((section) => sectionHtml(section)).join('\n');
  const faqs = page.faqs
    .map(
      (faq) =>
        `<article class="faq-item"><h3>${escapeHtml(faq.question)}</h3><div class="prose">${paragraphs([faq.answer])}</div></article>`
    )
    .join('');
  const footerLinks = nav
    .map((item) => {
      const cta = item.href === '/' ? ' data-cta="footer"' : '';
      return `<a href="${escapeHtml(item.href)}"${cta}>${escapeHtml(item.label)}</a>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b0d11">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="Lumiphane 3D">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/guides.css">
  ${structuredData(page, url, modified)}
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="/">${logo()}<span>Lumiphane 3D</span></a>
      <nav class="site-nav" aria-label="Guides">${navHtml}</nav>
    </div>
  </header>
  <main id="content" class="wrap">
    <nav aria-label="Breadcrumb">
      <ol class="crumbs">
        <li><a href="/">Lumiphane</a></li>
        <li aria-hidden="true">/</li>
        <li>${escapeHtml(page.breadcrumb)}</li>
      </ol>
    </nav>
    <header class="hero">
      <p class="kicker">${escapeHtml(page.kicker)}</p>
      <h1>${escapeHtml(page.h1)}</h1>
      <p class="lede">${renderInline(page.lede)}</p>
      <p><a class="cta" href="/" data-cta="hero">Create your lithophane</a></p>
      <p class="hero-note">${escapeHtml(page.heroNote)}</p>
    </header>
    <nav class="toc" aria-label="On this page">
      <p>On this page</p>
      <ol>${toc}</ol>
    </nav>
    ${body}
    <section class="prose" aria-labelledby="faq-heading">
      <h2 id="faq-heading">Questions</h2>
      ${faqs}
    </section>
    <aside class="end-cta">
      <h2>${escapeHtml(page.closing.heading)}</h2>
      <p>${renderInline(page.closing.body)}</p>
      <p><a class="cta" href="/" data-cta="end">Create your lithophane</a></p>
    </aside>
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <nav aria-label="Footer">${footerLinks}</nav>
      <p>Lumiphane builds the 3D model in your browser. Your slicer and printer make the physical part.</p>
    </div>
  </footer>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
    document.querySelectorAll('a[data-cta]').forEach(function (link) {
      link.addEventListener('click', function () {
        var host = location.hostname;
        var params = {
          page_path: location.pathname,
          cta: link.getAttribute('data-cta') || 'text',
          transport_type: 'beacon'
        };
        if (host === 'localhost' || host === '127.0.0.1') params.debug_mode = true;
        gtag('event', 'generator_cta_click', params);
      });
    });
  </script>
</body>
</html>
`;
}
