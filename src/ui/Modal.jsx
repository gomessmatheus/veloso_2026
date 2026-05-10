/**
 * src/ui/Modal.jsx
 * Modal primitivo do design system Ranked.
 *
 * Features:
 * - Desktop: dialog centralizado com animação slide-up sutil
 * - Mobile (≤768px): bottom sheet com handle drag indicator
 * - Fechar: click no overlay, botão ×, tecla Escape
 * - a11y: role="dialog", aria-modal, aria-labelledby, foco no open
 * - reduced-motion: animação desabilitada via @media
 *
 * Uso:
 *   <Modal title="Editar Contrato" onClose={onClose} width={640}
 *     footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button>
 *               <Button variant="primary" onClick={onSave}>Salvar</Button></>}>
 *     {children}
 *   </Modal>
 */

import { useEffect, useRef } from 'react';
import { injectGlobalUI } from './_inject.js';
import { Icon } from './Icon.jsx';
import { IconButton } from './Button.jsx';
import { t } from '../lib/theme.js';

injectGlobalUI();

// Detect mobile at render time (same pattern as App.jsx)
function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

/**
 * @param {{
 *   title:    string,
 *   onClose:  () => void,
 *   children: React.ReactNode,
 *   footer?:  React.ReactNode,
 *   width?:   number,
 * }} props
 */
export function Modal({ title, onClose, children, footer, width = 640 }) {
  const mob        = isMobileViewport();
  const titleId    = `modal-title-${Math.random().toString(36).slice(2, 7)}`;
  const contentRef = useRef(null);

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Trap scroll on body
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Initial focus on content
  useEffect(() => {
    const el = contentRef.current?.querySelector('input, textarea, select, button, [tabindex]');
    el?.focus();
  }, []);

  return (
    /* Overlay */
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        zIndex:         t.z.modal,
        display:        'flex',
        alignItems:     mob ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        padding:        mob ? 0 : `${t.space[12]} ${t.space[4]}`,
        overflowY:      mob ? 'hidden' : 'auto',
      }}
    >
      {/* Dialog */}
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={mob ? 'ranked-sheet-content' : 'ranked-modal-content'}
        style={{
          background:   t.color.neutral[0],
          borderRadius: mob ? `${t.radius.xl} ${t.radius.xl} 0 0` : t.radius.xl,
          border:       mob ? 'none' : t.border.thin,
          width:        '100%',
          maxWidth:     mob ? '100%' : width,
          maxHeight:    mob ? '92vh' : 'calc(100vh - 96px)',
          display:      'flex',
          flexDirection:'column',
          boxShadow:    t.shadow.lg,
          flexShrink:   0,
        }}
      >
        {/* Mobile drag handle */}
        {mob && (
          <div style={{ padding:`${t.space[3]} 0 ${t.space[1]}`, display:'flex', justifyContent:'center', flexShrink:0 }}>
            <div style={{ width:36, height:4, borderRadius:t.radius.full, background:t.color.neutral[300] }}/>
          </div>
        )}

        {/* Header */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent:'space-between',
          padding:      mob ? `${t.space[2]} ${t.space[5]} ${t.space[3]}` : `${t.space[4]} ${t.space[5]}`,
          borderBottom: t.border.thin,
          flexShrink:   0,
          gap:          t.space[3],
        }}>
          <span
            id={titleId}
            style={{
              fontSize:     t.font.size.sm,
              fontWeight:   t.font.weight.semibold,
              letterSpacing:'0.04em',
              textTransform:'uppercase',
              color:        t.color.neutral[900],
            }}
          >
            {title}
          </span>
          <IconButton
            icon={<Icon name="x" size={16} color={t.color.neutral[500]}/>}
            ariaLabel="Fechar"
            size="sm"
            variant="ghost"
            onClick={onClose}
          />
        </div>

        {/* Body */}
        <div style={{
          padding:   `${t.space[5]}`,
          overflowY: 'auto',
          flex:      1,
          WebkitOverflowScrolling: 'touch',
        }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            display:      'flex',
            justifyContent:'flex-end',
            alignItems:   'center',
            gap:          t.space[2],
            padding:      `${t.space[3]} ${t.space[5]}`,
            borderTop:    t.border.thin,
            background:   t.color.neutral[50],
            borderRadius: mob ? 0 : `0 0 ${t.radius.xl} ${t.radius.xl}`,
            flexShrink:   0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
