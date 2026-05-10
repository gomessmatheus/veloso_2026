/**
 * src/ui/Input.jsx
 * Input primitivo do design system Ranked.
 *
 * Label sempre acima (não floating). Simples e acessível.
 *
 * Uso:
 *   <Input label="Senha" type="password" value={pw} onChange={e=>setPw(e.target.value)} error={err}/>
 *   <Input label="Buscar" leftIcon={<Icon name="search" size={14}/>} placeholder="Buscar contrato…"/>
 */

import { useState } from 'react';
import { t } from '../lib/theme.js';

// Focus ring styles injected once
if (typeof document !== 'undefined' && !document.getElementById('ranked-input-styles')) {
  const style = document.createElement('style');
  style.id = 'ranked-input-styles';
  style.textContent = `
    .ranked-input-el:focus {
      outline: none;
      border-color: ${t.color.brand[500]} !important;
      box-shadow: 0 0 0 3px rgba(185,28,28,0.12);
    }
    .ranked-input-el::placeholder { color: ${t.color.neutral[400]}; }
  `;
  document.head.appendChild(style);
}

/**
 * @param {{
 *   label?: string,
 *   hint?: string,
 *   error?: string | boolean,
 *   leftIcon?: React.ReactNode,
 *   rightIcon?: React.ReactNode,
 *   type?: string,
 *   value?: string,
 *   onChange?: Function,
 *   onKeyDown?: Function,
 *   placeholder?: string,
 *   autoFocus?: boolean,
 *   ariaLabel?: string,
 *   name?: string,
 *   fullWidth?: boolean,
 *   disabled?: boolean,
 *   id?: string,
 *   style?: object,
 * }} props
 */
export function Input({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  type     = 'text',
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoFocus,
  ariaLabel,
  name,
  fullWidth = true,
  disabled  = false,
  id,
  style: extraStyle,
  ...rest
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const hasError = !!error;

  const wrapStyle = {
    display:       'flex',
    flexDirection: 'column',
    gap:           t.space[1],
    width:         fullWidth ? '100%' : undefined,
    ...extraStyle,
  };

  const labelStyle = {
    fontSize:      t.font.size.xs,
    fontWeight:    t.font.weight.medium,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color:         hasError ? t.color.danger[500] : t.color.neutral[500],
  };

  const fieldWrap = {
    position:      'relative',
    display:       'flex',
    alignItems:    'center',
  };

  const inputStyle = {
    width:           '100%',
    height:          '40px',
    padding:         leftIcon ? '0 12px 0 36px' : rightIcon ? '0 36px 0 12px' : `0 ${t.space[3]}`,
    fontSize:        t.font.size.base,
    fontFamily:      'inherit',
    color:           disabled ? t.color.neutral[400] : t.color.neutral[900],
    background:      disabled ? t.color.neutral[50] : t.color.neutral[0],
    border:          hasError ? `1px solid ${t.color.danger[500]}` : t.border.thin,
    borderRadius:    t.radius.md,
    transition:      `border-color ${t.motion.fast}, box-shadow ${t.motion.fast}`,
    cursor:          disabled ? 'not-allowed' : 'text',
    boxSizing:       'border-box',
  };

  const iconWrapL = {
    position:    'absolute',
    left:        '10px',
    display:     'flex',
    alignItems:  'center',
    color:       t.color.neutral[400],
    pointerEvents: 'none',
  };

  const iconWrapR = {
    position:    'absolute',
    right:       '10px',
    display:     'flex',
    alignItems:  'center',
    color:       t.color.neutral[400],
  };

  const hintStyle = {
    fontSize:   t.font.size.xs,
    color:      hasError ? t.color.danger[500] : t.color.neutral[500],
    lineHeight: t.font.lineHeight.normal,
  };

  return (
    <div style={wrapStyle}>
      {label && (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      )}
      <div style={fieldWrap}>
        {leftIcon && <span style={iconWrapL}>{leftIcon}</span>}
        <input
          id={inputId}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label={ariaLabel || label}
          aria-invalid={hasError}
          aria-describedby={hint || error ? `${inputId}-hint` : undefined}
          className="ranked-input-el"
          style={inputStyle}
          {...rest}
        />
        {rightIcon && <span style={iconWrapR}>{rightIcon}</span>}
      </div>
      {(error || hint) && (
        <span id={`${inputId}-hint`} style={hintStyle}>
          {typeof error === 'string' ? error : hint}
        </span>
      )}
    </div>
  );
}
