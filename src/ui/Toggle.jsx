/**
 * src/ui/Toggle.jsx
 * Toggle switch primitivo do design system Ranked.
 *
 * Decisão de design:
 * - Estado "on" usa neutral.900 (preto grafite), NÃO vermelho.
 *   Vermelho é reservado para erro/destruição (princípio 6).
 * - Teclado: Enter / Space para toggle.
 * - a11y: role="switch", aria-checked, aria-label.
 * - reduced-motion: transição da thumb desabilitada via @media.
 *
 * Uso:
 *   <Toggle on={hasCommission} onToggle={toggleComm}
 *     label="Comissão Ranked" ariaLabel="Ativar comissão Ranked"/>
 *
 *   // Apenas o switch sem label:
 *   <Toggle on={active} onToggle={setActive} ariaLabel="Ativo"/>
 */

import { injectGlobalUI } from './_inject.js';
import { t } from '../lib/theme.js';

injectGlobalUI();

const TRACK_W  = 36; // px
const TRACK_H  = 20; // px
const THUMB_SZ = 14; // px
const THUMB_OFF = 2; // px inset from edge

/**
 * @param {{
 *   on:        boolean,
 *   onToggle:  () => void,
 *   label?:    string,
 *   ariaLabel?: string,
 *   disabled?: boolean,
 *   size?:     'sm' | 'md',
 * }} props
 */
export function Toggle({ on, onToggle, label, ariaLabel, disabled = false, size = 'md' }) {
  const scale = size === 'sm' ? 0.85 : 1;

  const handleKey = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const trackStyle = {
    display:       'inline-block',
    position:      'relative',
    width:         TRACK_W * scale,
    height:        TRACK_H * scale,
    borderRadius:  t.radius.full,
    background:    on ? t.color.neutral[900] : t.color.neutral[200],
    border:        on ? 'none' : t.border.thin,
    transition:    `background ${t.motion.base}`,
    cursor:        disabled ? 'not-allowed' : 'pointer',
    opacity:       disabled ? 0.5 : 1,
    flexShrink:    0,
  };

  const thumbStyle = {
    position:     'absolute',
    top:          THUMB_OFF * scale,
    left:         on ? (TRACK_W - THUMB_SZ - THUMB_OFF) * scale : THUMB_OFF * scale,
    width:        THUMB_SZ * scale,
    height:       THUMB_SZ * scale,
    borderRadius: t.radius.full,
    background:   t.color.neutral[0],
    boxShadow:    t.shadow.xs,
    transition:   `left ${t.motion.base}`,
  };

  const toggle = (
    <div
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel || label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className="ranked-toggle"
      onClick={disabled ? undefined : onToggle}
      onKeyDown={handleKey}
      style={trackStyle}
    >
      <div style={thumbStyle}/>
    </div>
  );

  if (!label) return toggle;

  return (
    <div
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        t.space[2],
        cursor:     disabled ? 'not-allowed' : 'pointer',
        opacity:    disabled ? 0.5 : 1,
      }}
      onClick={disabled ? undefined : onToggle}
    >
      {toggle}
      <span style={{
        fontSize:   t.font.size.sm,
        fontWeight: t.font.weight.medium,
        color:      on ? t.color.neutral[900] : t.color.neutral[500],
        userSelect: 'none',
        transition: `color ${t.motion.fast}`,
      }}>
        {label}
      </span>
    </div>
  );
}
