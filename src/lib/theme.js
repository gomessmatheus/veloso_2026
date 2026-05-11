/**
 * src/lib/theme.js
 * Design system Ranked — única fonte de verdade visual.
 *
 * Regras:
 * - Toda cor no app DEVE vir daqui. Nada de hex solto fora deste arquivo.
 * - Toda dimensão (padding, margin, gap, font-size, radius) DEVE usar
 *   a escala definida aqui.
 * - TODO: carregar Inter via Google Fonts ou bundle local. Hoje usa
 *   system-ui como fallback real (Plus Jakarta Sans estava declarada
 *   mas não carregada).
 */

/**
 * Design tokens Ranked — única fonte de verdade visual.
 *
 * ESCALA TIPOGRÁFICA MÍNIMA: 11px (ds.font.size.xs).
 * Valores abaixo de 11px NÃO devem ser introduzidos:
 *   - WCAG AA prático: texto abaixo de 11px falha contraste em fundos claros
 *   - Legibilidade em mobile: densidades abaixo de 11px são ilegíveis em 360px
 *   - Regra de conformidade: `fontSize: 9` e `fontSize: 10` são proibidos
 *
 * TODO Fase 13: migrar para Tailwind v4 @theme — PR isolado, aprovação explícita.
 */
export const theme = {
  // ── COLOR SCALES ─────────────────────────────────────────
  color: {
    // Neutros (slate). Use para 90% da UI.
    neutral: {
      0:    '#FFFFFF',
      50:   '#F8FAFC',
      100:  '#F1F5F9',
      200:  '#E2E8F0',
      300:  '#CBD5E1',
      400:  '#94A3B8',
      500:  '#64748B',
      600:  '#475569',
      700:  '#334155',
      800:  '#1E293B',
      900:  '#0F172A',
      1000: '#020617',
    },

    // Marca Ranked — vermelho dessaturado, mais maduro.
    brand: {
      50:  '#FEF2F2',
      100: '#FEE2E2',
      500: '#B91C1C',
      600: '#991B1B',
      700: '#7F1D1D',
    },

    // Acento Copiloto — SOMENTE no painel/botão flutuante do Copiloto.
    copilot: {
      50:  '#F5F3FF',
      500: '#6D28D9',
      600: '#5B21B6',
    },

    // Semânticas — usar APENAS para o significado correspondente.
    danger:  { 50: '#FEF2F2', 500: '#B91C1C', 700: '#7F1D1D' },
    warning: { 50: '#FFFBEB', 500: '#B45309', 700: '#78350F' },
    success: { 50: '#F0FDF4', 500: '#15803D', 700: '#14532D' },
    info:    { 50: '#EFF6FF', 500: '#1D4ED8', 700: '#1E3A8A' },
  },

  // ── TYPOGRAPHY ───────────────────────────────────────────
  font: {
    // TODO: carregar Inter. Por ora system-ui é o que renderiza.
    sans: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',

    size: {
      xs:   '11px',
      sm:   '12px',
      base: '13px', // densidade de produto sério
      md:   '14px',
      lg:   '16px',
      xl:   '18px',
      '2xl':'22px',
      '3xl':'28px',
      '4xl':'36px',
      '5xl':'48px',
    },
    weight: { regular: 400, medium: 500, semibold: 600 },
    lineHeight: { tight: 1.2, normal: 1.4, relaxed: 1.55 },
    letterSpacing: {
      tight:    '-0.01em', // headings
      normal:   '0em',
      wide:     '0.04em',  // corpo uppercase discreto
      wider:    '0.08em',  // status pills
      widest:   '0.12em',  // overline padrão
    },
    tabular: { fontVariantNumeric: 'tabular-nums' },
  },

  // ── SPACING (múltiplos de 4) ──────────────────────────────
  space: {
    0:  '0px',
    1:  '4px',
    2:  '8px',
    3:  '12px',
    4:  '16px',
    5:  '20px',
    6:  '24px',
    8:  '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
  },

  // ── RADIUS ───────────────────────────────────────────────
  radius: {
    none: '0px',
    sm:   '4px',   // chips, badges
    md:   '6px',   // botões, inputs
    lg:   '8px',   // cards
    xl:   '12px',  // modais, painéis
    full: '999px', // pills, avatares
  },

  // ── ELEVATION ────────────────────────────────────────────
  shadow: {
    none:  'none',
    xs:    '0 1px 2px rgba(15,23,42,0.06)',
    sm:    '0 4px 8px rgba(15,23,42,0.06)',
    md:    '0 12px 24px rgba(15,23,42,0.08)',
    lg:    '0 24px 48px rgba(15,23,42,0.10)',
    panel: '-12px 0 32px rgba(15,23,42,0.08)', // painel Copiloto
  },

  // ── BORDERS ──────────────────────────────────────────────
  border: {
    thin:   '1px solid #E2E8F0',  // neutral.200
    medium: '1px solid #CBD5E1',  // neutral.300
    focus:  '2px solid #B91C1C',  // brand.500
  },

  // ── TRANSITIONS ──────────────────────────────────────────
  motion: {
    fast: '120ms ease-out',
    base: '160ms ease-out',
    slow: '240ms ease-out',
  },

  // ── Z-INDEX ──────────────────────────────────────────────
  z: {
    base:    1,
    dropdown: 50,
    sticky:  100,
    overlay: 500,
    modal:   600,
    toast:   700,
    copilot: 550,
  },
};

/** Shortcut */
export const t = theme;

/** Merge style objects (avoids spreading noise at call sites) */
export const css = (...styleObjs) => Object.assign({}, ...styleObjs);
