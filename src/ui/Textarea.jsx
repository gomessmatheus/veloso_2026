/**
 * src/ui/Textarea.jsx
 * Textarea primitivo — mesmo sistema de label/error do Input.
 *
 * Uso:
 *   <Textarea label="Briefing" value={text} onChange={e=>set(e.target.value)}
 *     placeholder="Descreva o briefing…" rows={6} error={err}/>
 */
import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';

injectGlobalUI();

export function Textarea({ label, hint, error, value, onChange, onBlur,
  placeholder, rows=4, disabled=false, fullWidth=true,
  ariaLabel, id, style:extraStyle, ...rest }) {

  const taId      = id || (label ? `ta-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);
  const hasError  = !!error;
  const errorText = typeof error === 'string' ? error : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:t.space[1], width:fullWidth?'100%':undefined, ...extraStyle }}>
      {label && (
        <label htmlFor={taId} style={{ fontSize:t.font.size.xs, fontWeight:t.font.weight.medium,
          letterSpacing:'0.06em', textTransform:'uppercase',
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {label}
        </label>
      )}
      <textarea
        id={taId}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={ariaLabel || label}
        aria-invalid={hasError}
        className="ranked-field"
        style={{
          width:        '100%',
          padding:      `${t.space[3]} ${t.space[3]}`,
          fontSize:     t.font.size.base,
          fontFamily:   'inherit',
          lineHeight:   t.font.lineHeight.relaxed,
          color:        disabled ? t.color.neutral[400] : t.color.neutral[900],
          background:   disabled ? t.color.neutral[50]  : t.color.neutral[0],
          border:       hasError ? `1px solid ${t.color.danger[500]}` : t.border.thin,
          borderRadius: t.radius.md,
          resize:       'vertical',
          transition:   `border-color ${t.motion.fast}, box-shadow ${t.motion.fast}`,
          boxSizing:    'border-box',
        }}
        {...rest}
      />
      {(errorText || hint) && (
        <span style={{ fontSize:t.font.size.xs, lineHeight:t.font.lineHeight.normal,
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {errorText || hint}
        </span>
      )}
    </div>
  );
}
