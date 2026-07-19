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

    // Marca Ranked — vermelho oficial (#C8102E), igual logo, favicon e theme-color.
    brand: {
      50:  '#FEF2F2',
      100: '#FEE2E2',
      500: '#C8102E',
      600: '#A60E26',
      700: '#7F0A1E',
    },

    // Acento Copiloto — SOMENTE no painel/botão flutuante do Copiloto.
    copilot: {
      50:  '#F5F3FF',
      500: '#6D28D9',
      600: '#5B21B6',
    },

    // Semânticas — usar APENAS para o significado correspondente.
    danger:  { 50: '#FEF2F2', 500: '#C8102E', 700: '#7F0A1E' },
    warning: { 50: '#FFFBEB', 500: '#B45309', 700: '#78350F' },
    success: { 50: '#F0FDF4', 500: '#15803D', 700: '#14532D' },
    info:    { 50: '#EFF6FF', 500: '#1D4ED8', 700: '#1E3A8A' },
  },

  // ── TYPOGRAPHY ───────────────────────────────────────────
  font: {
    // Inter (corpo) e Sora (títulos/números) carregadas via <link> no index.html.
    sans:    '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    display: '"Sora", "Inter", system-ui, sans-serif',
    mono:    '"JetBrains Mono", ui-monospace, monospace',

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
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
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
  // Repaginação 2026-07: cantos mais generosos (clean & minimal).
  radius: {
    none: '0px',
    sm:   '6px',   // chips, badges
    md:   '8px',   // botões, inputs
    lg:   '12px',  // cards
    xl:   '16px',  // modais, painéis
    full: '999px', // pills, avatares
  },

  // ── ELEVATION ────────────────────────────────────────────
  // Sombras em camadas, bem suaves — cartões "flutuam" sem borda pesada.
  shadow: {
    none:  'none',
    xs:    '0 1px 2px rgba(15,23,42,0.04)',
    sm:    '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05)',
    md:    '0 2px 4px rgba(15,23,42,0.04), 0 16px 40px rgba(15,23,42,0.08)',
    lg:    '0 4px 8px rgba(15,23,42,0.05), 0 28px 64px rgba(15,23,42,0.12)',
    panel: '-12px 0 40px rgba(15,23,42,0.10)', // painel Copiloto
  },

  // ── BORDERS ──────────────────────────────────────────────
  border: {
    thin:   '1px solid #EBEFF4',  // mais leve que neutral.200 — quase invisível
    medium: '1px solid #CBD5E1',  // neutral.300
    focus:  '2px solid #C8102E',  // brand.500
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
