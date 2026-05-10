/**
 * src/ui/Input.jsx — FASE 1 (updated to use shared injector)
 * Label sempre acima. Error state com ring brand. Suporta leftIcon / rightIcon.
 */
import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';

injectGlobalUI();

export function Input({ label, hint, error, leftIcon, rightIcon, type='text', value, onChange,
  onKeyDown, placeholder, autoFocus, ariaLabel, name, fullWidth=true, disabled=false,
  id, style:extraStyle, ...rest }) {

  const inputId   = id || (label ? `inp-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);
  const hasError  = !!error;
  const errorText = typeof error === 'string' ? error : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:t.space[1], width:fullWidth?'100%':undefined, ...extraStyle }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize:t.font.size.xs, fontWeight:t.font.weight.medium,
          letterSpacing:'0.06em', textTransform:'uppercase',
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {label}
        </label>
      )}
      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
        {leftIcon && (
          <span style={{ position:'absolute', left:10, display:'flex', alignItems:'center',
            color:t.color.neutral[400], pointerEvents:'none' }}>
            {leftIcon}
          </span>
        )}
        <input id={inputId} name={name} type={type} value={value} onChange={onChange}
          onKeyDown={onKeyDown} placeholder={placeholder} autoFocus={autoFocus}
          disabled={disabled} aria-label={ariaLabel || label} aria-invalid={hasError}
          aria-describedby={(errorText || hint) ? `${inputId}-hint` : undefined}
          className="ranked-field"
          style={{ width:'100%', height:'40px',
            padding: leftIcon ? '0 12px 0 36px' : rightIcon ? '0 36px 0 12px' : `0 ${t.space[3]}`,
            fontSize:t.font.size.base, fontFamily:'inherit',
            color: disabled ? t.color.neutral[400] : t.color.neutral[900],
            background: disabled ? t.color.neutral[50] : t.color.neutral[0],
            border: hasError ? `1px solid ${t.color.danger[500]}` : t.border.thin,
            borderRadius:t.radius.md,
            transition:`border-color ${t.motion.fast}, box-shadow ${t.motion.fast}`,
            boxSizing:'border-box' }}
          {...rest}/>
        {rightIcon && (
          <span style={{ position:'absolute', right:10, display:'flex', alignItems:'center',
            color:t.color.neutral[400] }}>
            {rightIcon}
          </span>
        )}
      </div>
      {(errorText || hint) && (
        <span id={`${inputId}-hint`} style={{ fontSize:t.font.size.xs, lineHeight:t.font.lineHeight.normal,
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {errorText || hint}
        </span>
      )}
    </div>
  );
}
