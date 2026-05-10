/**
 * src/ui/CurrencyRateBadge.jsx
 * Chip compacto de cotações vivas. Consome useFx() — precisa de FxProvider.
 *
 * Estados:
 *   loading  → Skeleton inline
 *   ok       → "USD R$ 5,92 · EUR R$ 6,40 · há 8 min"
 *   stale    → mesmo + ícone warning amarelo
 *   manual   → badge "Manual" + mesmos números
 *   error    → "Indisponíveis · Tentar novamente"
 *
 * Uso:
 *   <CurrencyRateBadge/>
 *   <CurrencyRateBadge size="sm" currencies={['EUR']} showRefresh/>
 */

import { useFx } from '../lib/FxContext.jsx';
import { formatRelativeTime, formatRate } from '../lib/fx.js';
import { Icon }     from './Icon.jsx';
import { Skeleton } from './Skeleton.jsx';
import { t }        from '../lib/theme.js';
import { injectGlobalUI } from './_inject.js';

injectGlobalUI();

const LABEL = { USD: 'USD', EUR: 'EUR' };

/**
 * @param {{
 *   currencies?: ('USD'|'EUR')[],
 *   size?: 'sm' | 'md',
 *   showRefresh?: boolean,
 * }} props
 */
export function CurrencyRateBadge({
  currencies   = ['USD', 'EUR'],
  size         = 'md',
  showRefresh  = false,
}) {
  const { rates, loading, error, stale, fetchedAt, source, isManual, refresh } = useFx();
  const sm = size === 'sm';

  // ── Loading inicial (sem cache ainda) ──────────────────
  if (loading && !rates) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:t.space[2] }}>
        {currencies.map(cur => (
          <Skeleton key={cur} width={80} height={sm ? 20 : 24} radius={99}/>
        ))}
      </div>
    );
  }

  // ── Erro sem cache ──────────────────────────────────────
  if (error && !rates) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:t.space[2] }}>
        <span style={{ fontSize: sm ? t.font.size.xs : t.font.size.sm, color: t.color.neutral[400] }}>
          Cotações indisponíveis
        </span>
        <button onClick={refresh} title="Tentar novamente"
          style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center' }}>
          <Icon name="refresh" size={sm ? 12 : 14} color={t.color.neutral[400]}/>
        </button>
      </div>
    );
  }

  // ── Badge normal / stale / manual ──────────────────────
  const isWarn    = stale || isManual;
  const accentColor = isManual
    ? t.color.info[500]
    : stale
    ? t.color.warning[500]
    : t.color.neutral[400];

  const wrapStyle = {
    display: 'inline-flex', alignItems: 'center', gap: t.space[2],
    padding: `2px ${sm ? t.space[2] : t.space[3]}`,
    background: isWarn ? `${accentColor}08` : t.color.neutral[50],
    border: `1px solid ${isWarn ? accentColor + '30' : t.color.neutral[200]}`,
    borderRadius: t.radius.full,
    cursor: 'default',
  };

  const numStyle = {
    fontVariantNumeric: 'tabular-nums',
    fontSize: sm ? t.font.size.xs : t.font.size.sm,
    fontWeight: t.font.weight.semibold,
    color: isWarn ? t.color.warning[700] : t.color.neutral[900],
  };

  const labelStyle = {
    fontSize: sm ? 9 : t.font.size.xs,
    fontWeight: t.font.weight.semibold,
    color: isWarn ? accentColor : t.color.neutral[400],
    letterSpacing: '0.06em',
  };

  const ageStyle = {
    fontSize: 9,
    color: isWarn ? accentColor : t.color.neutral[400],
    letterSpacing: '0.02em',
  };

  const tooltip = isManual
    ? 'Cotação manual — auto-fetch desativado'
    : stale
    ? `Cotação desatualizada. Última: ${formatRelativeTime(fetchedAt)} (${source})`
    : `Cotação automática · ${source} · ${formatRelativeTime(fetchedAt)}`;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:t.space[1] }}>
      <div style={wrapStyle} title={tooltip}>
        {isWarn && (
          <Icon name={isManual ? 'info' : 'alertCircle'}
            size={sm ? 11 : 13} color={accentColor}/>
        )}
        {currencies.map((cur, i) => (
          <span key={cur} style={{ display:'flex', alignItems:'center', gap:3 }}>
            {i > 0 && (
              <span style={{ color: t.color.neutral[300], fontSize: t.font.size.xs }}>·</span>
            )}
            <span style={labelStyle}>{LABEL[cur]}</span>
            <span style={numStyle}>{formatRate(rates?.[cur])}</span>
          </span>
        ))}
        <span style={ageStyle}>{formatRelativeTime(fetchedAt)}</span>
      </div>

      {showRefresh && (
        <button onClick={refresh} disabled={loading} title="Atualizar cotações"
          aria-label="Atualizar cotações" className="ranked-btn"
          style={{ background:'none', border:'none', cursor: loading ? 'wait' : 'pointer',
            padding:2, display:'flex', alignItems:'center', borderRadius: t.radius.sm, outline:'none' }}>
          <Icon name="refresh" size={sm ? 12 : 14} color={t.color.neutral[400]}
            style={{ animation: loading ? 'ranked-spin 0.8s linear infinite' : 'none' }}/>
        </button>
      )}
    </div>
  );
}
