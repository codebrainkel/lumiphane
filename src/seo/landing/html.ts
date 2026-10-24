const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\') && !href.includes(':');
}

/** Renders text with internal markdown links. Everything else is escaped. */
export function renderInline(source: string): string {
  let html = '';
  let last = 0;
  for (const match of source.matchAll(LINK)) {
    const index = match.index ?? 0;
    html += escapeHtml(source.slice(last, index));
    const label = match[1] ?? '';
    const href = match[2] ?? '';
    if (!label || !isSafeHref(href)) {
      html += escapeHtml(match[0]);
    } else {
      const cta = href === '/' ? ' data-cta="text"' : '';
      html += `<a href="${escapeHtml(href)}"${cta}>${escapeHtml(label)}</a>`;
    }
    last = index + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  return html;
}

export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
