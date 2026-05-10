/**
 * src/ui/Button.jsx — FASE 1 (fixed: removed dead hook, shared injector)
 */
import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';

injectGlobalUI();

const SIZE = {
  sm: { height: 32, padding: '0 12px', fontSize: t.font.size.sm,   gap: t.space[1] },
  md: { height: 36, padding: '0 16px', fontSize: t.font.size.base, gap: t.space[2] },
  lg: { height: 44, padding: '0 20px', fontSize: t.font.size.md,   gap: t.space[2] },
};

const VARIANT = {
  primary:   { base: { background: t.color.neutral[900], color: t.color.neutral[0],   border: 'none'       }, hover: { background: t.color.neutral[800] } },
  secondary: { base: { background: t.color.neutral[0],   color: t.color.neutral[900], border: t.border.thin }, hover: { background: t.color.neutral[50]  } },
  danger:    { base: { background: t.color.danger[500],  color: t.color.neutral[0],   border: 'none'       }, hover: { background: t.color.danger[700]  } },
  ghost:     { base: { background: 'transparent',        color: t.color.neutral[700], border: 'none'       }, hover: { background: t.color.neutral[100] } },
};

function Spinner({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round"
      style={{ animation:'ranked-spin 0.8s linear infinite', display:'block', flexShrink:0 }} aria-hidden="true">
      <path d="M12 2a10 10 0 0 0 0 20" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
  );
}

export function Button({ variant='secondary', size='md', leftIcon, rightIcon, loading=false,
  disabled=false, fullWidth=false, type='button', onClick, children, style:extraStyle, ...rest }) {
  const s = SIZE[size] ?? SIZE.md;
  const v = VARIANT[variant] ?? VARIANT.secondary;
  const off = disabled || loading;

  const onEnter = (e) => { if (!off) Object.assign(e.currentTarget.style, v.hover); };
  const onLeave = (e) => { Object.assign(e.currentTarget.style, { background: v.base.background }); };

  return (
    <button type={type} className="ranked-btn" disabled={off}
      onClick={off ? undefined : onClick}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
        gap:s.gap, height:`${s.height}px`, padding:s.padding, fontSize:s.fontSize,
        fontWeight:t.font.weight.medium, fontFamily:'inherit', lineHeight:1,
        letterSpacing:'-0.01em', borderRadius:t.radius.md,
        border:v.base.border, background:v.base.background, color:v.base.color,
        width:fullWidth?'100%':undefined,
        transition:`background ${t.motion.fast}, opacity ${t.motion.fast}`,
        userSelect:'none', whiteSpace:'nowrap', outline:'none',
        boxSizing:'border-box', flexShrink:0, ...extraStyle }} {...rest}>
      {loading ? <Spinner size={size==='lg'?15:13}/> : (leftIcon ?? null)}
      {children}
      {!loading && rightIcon ? rightIcon : null}
    </button>
  );
}

export function IconButton({ icon, ariaLabel, size='md', variant='ghost', onClick, disabled, style:extraStyle, ...rest }) {
  const s = SIZE[size] ?? SIZE.md;
  const v = VARIANT[variant] ?? VARIANT.ghost;
  const onEnter = (e) => { if (!disabled) Object.assign(e.currentTarget.style, v.hover); };
  const onLeave = (e) => { Object.assign(e.currentTarget.style, { background: v.base.background }); };
  return (
    <button type="button" className="ranked-btn" aria-label={ariaLabel}
      disabled={disabled} onClick={disabled ? undefined : onClick}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:`${s.height}px`, height:`${s.height}px`, padding:0,
        borderRadius:t.radius.md, border:v.base.border,
        background:v.base.background, color:v.base.color,
        transition:`background ${t.motion.fast}`, outline:'none', flexShrink:0, ...extraStyle }} {...rest}>
      {icon}
    </button>
  );
}
