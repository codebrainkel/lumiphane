export function transmissionFigure(titleId: string, descId: string): string {
  return `<svg viewBox="0 0 640 280" role="img" aria-labelledby="${titleId} ${descId}">
  <title id="${titleId}">Cross-section of a lithophane</title>
  <desc id="${descId}">A wall that is thin on the left and thick on the right. More light passes through the thin side, so that side looks bright. The thick side looks dark.</desc>
  <rect width="640" height="280" fill="#090b10"/>
  <text x="32" y="36" fill="#ffc21a" font-family="ui-monospace, monospace" font-size="12" font-weight="700">LIGHT FROM BEHIND</text>
  <g fill="none" stroke="#ffd24a" stroke-width="1.5" opacity="0.9">
    <path d="M40 78h70M40 110h90M40 142h110M40 174h130M40 206h70"/>
    <path d="M40 78l10-4v8zM40 110l10-4v8zM40 142l10-4v8zM40 174l10-4v8zM40 206l10-4v8z" fill="#ffd24a" stroke="none"/>
  </g>
  <path d="M210 58h70l150 16v132l-150 16h-70z" fill="#f8fafc" opacity="0.92"/>
  <path d="M280 58l150 16v132l-150 16z" fill="#cbd5e1"/>
  <path d="M360 66l70 8v132l-70 8z" fill="#64748b"/>
  <text x="228" y="148" fill="#1a1204" font-family="system-ui, sans-serif" font-size="13" font-weight="700">Thin</text>
  <text x="470" y="148" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="13" font-weight="700">Thick</text>
  <text x="214" y="248" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">Bright tone</text>
  <text x="455" y="248" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">Dark tone</text>
</svg>`;
}

export function lampsFigure(titleId: string, descId: string): string {
  return `<svg viewBox="0 0 640 220" role="img" aria-labelledby="${titleId} ${descId}">
  <title id="${titleId}">Four Lumiphane lamp shapes</title>
  <desc id="${descId}">A round cylinder, a hexagon, a cube, and a curved panel. The first three are open tubes. The curved panel is an arc that stands in front of a light.</desc>
  <rect width="640" height="220" fill="#090b10"/>
  <g fill="none" stroke="#e2e8f0" stroke-width="2">
    <ellipse cx="80" cy="48" rx="36" ry="12"/>
    <path d="M44 48v90M116 48v90"/>
    <ellipse cx="80" cy="138" rx="36" ry="12"/>
    <path d="M142 78 L178 56 L214 78 L214 122 L178 144 L142 122 Z"/>
    <path d="M292 78h56v62h-56z"/>
    <path d="M348 78l22-16v62l-22 16"/>
    <path d="M292 78l22-16h56"/>
    <path d="M470 78c40 8 70 8 110 0v70c-40 8-70 8-110 0z"/>
  </g>
  <g fill="#ffc21a" font-family="system-ui, sans-serif" font-size="13" font-weight="700">
    <text x="80" y="186" text-anchor="middle">Cylinder</text>
    <text x="178" y="186" text-anchor="middle">Hexagon</text>
    <text x="331" y="186" text-anchor="middle">Cube</text>
    <text x="525" y="186" text-anchor="middle">Curved panel</text>
  </g>
  <g fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11">
    <text x="80" y="204" text-anchor="middle">360° shade</text>
    <text x="178" y="204" text-anchor="middle">6 flat walls</text>
    <text x="331" y="204" text-anchor="middle">4 flat walls</text>
    <text x="525" y="204" text-anchor="middle">Arc, up to 120°</text>
  </g>
</svg>`;
}
