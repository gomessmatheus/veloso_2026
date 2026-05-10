/**
 * src/ui/Button.jsx
 * Botão primitivo do design system Ranked.
 *
 * Variantes: primary | secondary | danger | ghost
 * Tamanhos:  sm (32px) | md (36px) | lg (44px)
 *
 * Uso:
 *   <Button variant="primary" size="md" onClick={...}>Salvar</Button>
 *   <Button variant="secondary" leftIcon={<Icon name="plus" size={14}/>}>Novo</Button>
 *   <Button loading>Processando…</Button>
 *   <IconButton icon={<Icon name="x" size={16}/>} ariaLabel="Fechar" size="sm"/>
 */

import { t } from '../lib/theme.js';

// Inject keyframe animation once
if (typeof document !== 'undefined' && !document.getElementById('ranked-button-styles')) {
  const style = document.createElement('style');
  style.id = 'ranked-button-styles';
  style.textContent = `
    @keyframes ranked-spin { to { transform: rotate(360deg); } }
    .ranked-btn:focus-visible {
      outline: 2px solid ${t.color.brand[500]};
      outline-offset: 2px;
    }
    .ranked-btn:active:not(:disabled) { transform: scale(0.98); }
    .ranked-btn:disabled { cursor: not-allowed; opacity: 0.5; }
  `;
  document.head.appendChild(style);
}

const SIZE = {
  sm: { height: 32, padding: '0 12px', fontSize: t.font.size.sm,   gap: t.space[1] },
  md: { height: 36, padding: '0 16px', fontSize: t.font.size.base, gap: t.space[2] },
  lg: { height: 44, padding: '0 20px', fontSize: t.font.size.md,   gap: t.space[2] },
};

const VARIANT_BASE = {
  primary: {
    background:  t.color.neutral[900],
    color:       t.color.neutral[0],
    border:      'none',
  },
  secondary: {
    background:  t.color.neutral[0],
    color:       t.color.neutral[900],
    border:      t.border.thin,
  },
  danger: {
    background:  t.color.danger[500],
    color:       t.color.neutral[0],
    border:      'none',
  },
  ghost: {
    background:  'transparent',
    color:       t.color.neutral[700],
    border:      'none',
  },
};

const VARIANT_HOVER = {
  primary:   { background: t.color.neutral[800] },
  secondary: { background: t.color.neutral[50]  },
  danger:    { background: t.color.danger[700]  },
  ghost:     { background: t.color.neutral[100] },
};

function Spinner({ size = 13, color = 'currentColor' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke={color} strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: 'ranked-spin 0.8s linear infinite', display: 'block' }}
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 0 0 20" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  );
}

/**
 * @param {{
 *   variant?: 'primary'|'secondary'|'danger'|'ghost',
 *   size?: 'sm'|'md'|'lg',
 *   leftIcon?: React.ReactNode,
 *   rightIcon?: React.ReactNode,
 *   loading?: boolean,
 *   disabled?: boolean,
 *   fullWidth?: boolean,
 *   type?: string,
 *   onClick?: Function,
 *   children: React.ReactNode,
 * }} props
 */
export function Button({
  variant  = 'secondary',
  size     = 'md',
  leftIcon,
  rightIcon,
  loading  = false,
  disabled = false,
  fullWidth = false,
  type     = 'button',
  onClick,
  children,
  style: extraStyle,
  ...rest
}) {
  const s     = SIZE[size]     || SIZE.md;
  const vBase = VARIANT_BASE[variant] || VARIANT_BASE.secondary;
  const vHov  = VARIANT_HOVER[variant] || VARIANT_HOVER.secondary;

  const isDisabled = disabled || loading;
  const [hovered, setHovered] = typeof window !== 'undefined'
    ? [false, () => {}] // will be overridden by hooks below
    : [false, () => {}];

  // We can't use useState here in a non-hook function —
  // so we manage hover via onMouseEnter/Leave with inline ref trick.
  const handleMouseEnter = (e) => {
    if (!isDisabled) Object.assign(e.currentTarget.style, { background: vHov.background });
  };
  const handleMouseLeave = (e) => {
    Object.assign(e.currentTarget.style, { background: vBase.background });
  };

  const baseStyle = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            s.gap,
    height:         `${s.height}px`,
    padding:        s.padding,
    fontSize:       s.fontSize,
    fontWeight:     t.font.weight.medium,
    fontFamily:     'inherit',
    lineHeight:     1,
    letterSpacing:  '-0.01em',
    borderRadius:   t.radius.md,
    border:         vBase.border,
    background:     vBase.background,
    color:          vBase.color,
    cursor:         isDisabled ? 'not-allowed' : 'pointer',
    opacity:        isDisabled ? 0.5 : 1,
    width:          fullWidth ? '100%' : undefined,
    transition:     `background ${t.motion.fast}, transform ${t.motion.fast}`,
    userSelect:     'none',
    whiteSpace:     'nowrap',
    textDecoration: 'none',
    outline:        'none',
    boxSizing:      'border-box',
    ...extraStyle,
  };

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className="ranked-btn"
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {loading ? (
        <Spinner size={size === 'lg' ? 15 : 13} color="currentColor"/>
      ) : leftIcon ? leftIcon : null}
      {children}
      {!loading && rightIcon ? rightIcon : null}
    </button>
  );
}

/**
 * Botão de apenas ícone, quadrado.
 * @param {{ icon: React.ReactNode, ariaLabel: string, size?: 'sm'|'md'|'lg', variant?: string, onClick?: Function }} props
 */
export function IconButton({ icon, ariaLabel, size = 'md', variant = 'ghost', onClick, disabled, style: extraStyle, ...rest }) {
  const s     = SIZE[size]     || SIZE.md;
  const vBase = VARIANT_BASE[variant] || VARIANT_BASE.ghost;
  const vHov  = VARIANT_HOVER[variant] || VARIANT_HOVER.ghost;

  const handleMouseEnter = (e) => {
    if (!disabled) Object.assign(e.currentTarget.style, { background: vHov.background });
  };
  const handleMouseLeave = (e) => {
    Object.assign(e.currentTarget.style, { background: vBase.background });
  };

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="ranked-btn"
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        justifyContent:'center',
        width:        `${s.height}px`,
        height:       `${s.height}px`,
        padding:      0,
        borderRadius: t.radius.md,
        border:       vBase.border,
        background:   vBase.background,
        color:        vBase.color,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        opacity:      disabled ? 0.5 : 1,
        transition:   `background ${t.motion.fast}`,
        outline:      'none',
        flexShrink:   0,
        ...extraStyle,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {icon}
    </button>
  );
}
