/**
 * src/ui/_inject.js
 * Injetado UMA VEZ pelos componentes primitivos.
 * Contém: keyframes, focus rings, reduced-motion guard.
 * Não exportar diretamente para consumidores — é detalhe de implementação.
 */

export function injectGlobalUI() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ranked-ui')) return;

  const s = document.createElement('style');
  s.id = 'ranked-ui';
  s.textContent = `
    /* ── Reduced motion guard ── */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* ── Keyframes ── */
    @keyframes ranked-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ranked-skeleton {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    @keyframes ranked-modal-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ranked-sheet-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

    /* ── Button ── */
    .ranked-btn {
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .ranked-btn:focus-visible {
      outline: 2px solid #B91C1C;
      outline-offset: 2px;
    }
    .ranked-btn:active:not([disabled]) {
      transform: scale(0.98);
    }
    .ranked-btn[disabled] {
      cursor: not-allowed;
      opacity: 0.5;
      transform: none !important;
    }

    /* ── Input / Select / Textarea ── */
    .ranked-field:focus {
      outline: none;
      border-color: #B91C1C !important;
      box-shadow: 0 0 0 3px rgba(185,28,28,0.12);
    }
    .ranked-field::placeholder {
      color: #94A3B8;
    }
    .ranked-field:disabled {
      cursor: not-allowed;
    }

    /* ── Toggle ── */
    .ranked-toggle:focus-visible {
      outline: 2px solid #B91C1C;
      outline-offset: 3px;
      border-radius: 999px;
    }

    /* ── Modal overlay ── */
    .ranked-modal-content {
      animation: ranked-modal-in 160ms ease-out both;
    }
    .ranked-sheet-content {
      animation: ranked-sheet-in 240ms ease-out both;
    }
  `;
  document.head.appendChild(s);
}
