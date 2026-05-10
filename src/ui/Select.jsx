/**
 * src/ui/Select.jsx
 * Select primitivo — mesmo sistema de label/error do Input.
 *
 * Uso:
 *   <Select label="Tipo de pagamento" value={f.type} onChange={e=>set('type',e.target.value)}>
 *     <option value="single">Pagamento único</option>
 *     <option value="split">Parcelado</option>
 *   </Select>
 */
import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';
import { Icon } from './Icon.jsx';

injectGlobalUI();

export function Select({ label, hint, error, value, onChange, children,
  disabled=false, fullWidth=true, ariaLabel, id, style:extraStyle, ...rest }) {

  const selectId  = id || (label ? `sel-${label.toLowerCase().replace(/\s+/g,'-')}` : undefined);
  const hasError  = !!error;
  const errorText = typeof error === 'string' ? error : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:t.space[1], width:fullWidth?'100%':undefined, ...extraStyle }}>
      {label && (
        <label htmlFor={selectId} style={{ fontSize:t.font.size.xs, fontWeight:t.font.weight.medium,
          letterSpacing:'0.06em', textTransform:'uppercase',
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {label}
        </label>
      )}
      <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
        <select
          id={selectId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-invalid={hasError}
          className="ranked-field"
          style={{
            width:          '100%',
            height:         '40px',
            padding:        `0 ${t.space[8]} 0 ${t.space[3]}`, // right space for chevron
            fontSize:       t.font.size.base,
            fontFamily:     'inherit',
            color:          disabled ? t.color.neutral[400] : t.color.neutral[900],
            background:     disabled ? t.color.neutral[50]  : t.color.neutral[0],
            border:         hasError ? `1px solid ${t.color.danger[500]}` : t.border.thin,
            borderRadius:   t.radius.md,
            appearance:     'none',
            WebkitAppearance: 'none',
            cursor:         disabled ? 'not-allowed' : 'pointer',
            transition:     `border-color ${t.motion.fast}, box-shadow ${t.motion.fast}`,
            boxSizing:      'border-box',
          }}
          {...rest}
        >
          {children}
        </select>
        {/* Chevron — pointer-events:none so clicks pass through to select */}
        <span style={{ position:'absolute', right:10, display:'flex', alignItems:'center',
          color:t.color.neutral[400], pointerEvents:'none' }}>
          <Icon name="chevronDown" size={14}/>
        </span>
      </div>
      {(errorText || hint) && (
        <span style={{ fontSize:t.font.size.xs, lineHeight:t.font.lineHeight.normal,
          color: hasError ? t.color.danger[500] : t.color.neutral[500] }}>
          {errorText || hint}
        </span>
      )}
    </div>
  );
}
