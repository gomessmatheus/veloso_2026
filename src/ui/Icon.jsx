/**
 * src/ui/Icon.jsx
 * Único wrapper de ícones do app.
 *
 * Regras:
 * - Nenhum SVG inline avulso no restante do código.
 * - Nenhum emoji como ícone funcional.
 * - Para adicionar novo ícone: inserir path em ICONS abaixo.
 *
 * Uso:
 *   <Icon name="lock" size={20} color={theme.color.neutral[600]} />
 *   <Icon name="eye" ariaLabel="Mostrar senha" />
 *
 * Conjunto inicial (stroke 1.5, viewBox 24×24, estilo Lucide):
 *   lock, lockOpen, eye, eyeOff, alertTriangle, alertCircle,
 *   checkCircle, info, plus, x, chevronDown, chevronRight,
 *   search, calendar, sparkles, arrowRight, edit, trash,
 *   download, upload, printer, user, check, minus
 */

// Each value is a function receiving strokeWidth so paths can adapt if needed.
// All paths use relative/absolute SVG commands; viewBox is 0 0 24 24.
const ICONS = {
  lock: () => (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
    </>
  ),
  lockOpen: () => (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
    </>
  ),
  eye: () => (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </>
  ),
  eyeOff: () => (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </>
  ),
  alertTriangle: () => (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </>
  ),
  alertCircle: () => (
    <>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </>
  ),
  checkCircle: () => (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </>
  ),
  info: () => (
    <>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </>
  ),
  x: () => (
    <>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </>
  ),
  chevronDown: () => <polyline points="6 9 12 15 18 9"/>,
  chevronRight: () => <polyline points="9 18 15 12 9 6"/>,
  chevronLeft: () => <polyline points="15 18 9 12 15 6"/>,
  search: () => (
    <>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </>
  ),
  calendar: () => (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </>
  ),
  sparkles: () => (
    <>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </>
  ),
  arrowRight: () => (
    <>
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </>
  ),
  edit: () => (
    <>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </>
  ),
  trash: () => (
    <>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </>
  ),
  download: () => (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </>
  ),
  upload: () => (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </>
  ),
  printer: () => (
    <>
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </>
  ),
  user: () => (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </>
  ),
  check: () => <polyline points="20 6 9 17 4 12"/>,
  minus: () => <line x1="5" y1="12" x2="19" y2="12"/>,
  tag: () => (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </>
  ),
  building: () => (
    <>
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </>
  ),
  zap: () => <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  send: () => (
    <>
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </>
  ),
  copy: () => (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </>
  ),
  save: () => (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </>
  ),
  filter: () => <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>,
  refresh: () => (
    <>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </>
  ),

  // ── Navigation icons (shell) ──────────────────────────────
  layoutDashboard: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </>
  ),
  kanban: () => (
    <>
      <rect x="2"  y="4" width="4" height="16" rx="1"/>
      <rect x="9"  y="4" width="4" height="11" rx="1"/>
      <rect x="16" y="4" width="4" height="7"  rx="1"/>
    </>
  ),
  fileText: () => (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9"  x2="8" y2="9"/>
    </>
  ),
  banknote: () => (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <circle cx="12" cy="12" r="2"/>
      <path d="M6 12h.01M18 12h.01"/>
    </>
  ),
  landmark: () => (
    <>
      <line x1="3"  y1="22" x2="21" y2="22"/>
      <line x1="6"  y1="18" x2="6"  y2="11"/>
      <line x1="10" y1="18" x2="10" y2="11"/>
      <line x1="14" y1="18" x2="14" y2="11"/>
      <line x1="18" y1="18" x2="18" y2="11"/>
      <polygon points="12 2 20 7 4 7"/>
    </>
  ),
  logOut: () => (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </>
  ),
  phone: () => (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.64 2.84h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  ),
  userPlus: () => (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8"  x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </>
  ),
  trendingUp: () => (
    <>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </>
  ),
  arrowUp: () => (
    <>
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </>
  ),
  arrowDown: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <polyline points="19 12 12 19 5 12"/>
    </>
  ),
  externalLink: () => (
    <>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </>
  ),
  chevronUp: () => <polyline points="18 15 12 9 6 15"/>,
  moreHorizontal: () => (
    <>
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </>
  ),
  clock: () => (
    <>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </>
  ),
  circle: () => <circle cx="12" cy="12" r="10"/>,
  home: () => (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </>
  ),
};

/**
 * @param {{ name: string, size?: number, color?: string, strokeWidth?: number, ariaLabel?: string }} props
 */
export function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.5, ariaLabel }) {
  const draw = ICONS[name];
  if (!draw) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] Unknown icon: "${name}". Add it to src/ui/Icon.jsx.`);
    }
    return null;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : 'presentation'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {draw()}
    </svg>
  );
}
