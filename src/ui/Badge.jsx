/**
 * src/ui/Badge.jsx
 * Badge primitivo do design system Ranked.
 *
 * Uso:
 *   <Badge variant="success">Entregue</Badge>
 *   <Badge variant="danger" size="sm">Atrasado</Badge>
 */

import { t } from '../lib/theme.js';

const VARIANT_STYLES = {
  neutral: { background: t.color.neutral[100],   color: t.color.neutral[700]  },
  brand:   { background: t.color.brand[50],       color: t.color.brand[700]   },
  danger:  { background: t.color.danger[50],      color: t.color.danger[700]  },
  warning: { background: t.color.warning[50],     color: t.color.warning[700] },
  success: { background: t.color.success[50],     color: t.color.success[700] },
  info:    { background: t.color.info[50],        color: t.color.info[700]    },
};

/**
 * @param {{
 *   variant?: 'neutral'|'brand'|'danger'|'warning'|'success'|'info',
 *   size?: 'sm'|'md',
 *   children: React.ReactNode,
 *   style?: object,
 * }} props
 */
export function Badge({ variant = 'neutral', size = 'md', children, style: extraStyle }) {
  const vs = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;

  return (
    <span
      style={{
        display:      'inline-flex',
        alignItems:   'center',
        height:       size === 'sm' ? '18px' : '22px',
        padding:      `0 ${t.space[2]}`,
        borderRadius: t.radius.sm,
        fontSize:     size === 'sm' ? t.font.size.xs : t.font.size.sm,
        fontWeight:   t.font.weight.medium,
        lineHeight:   1,
        letterSpacing:'0.01em',
        whiteSpace:   'nowrap',
        background:   vs.background,
        color:        vs.color,
        ...extraStyle,
      }}
    >
      {children}
    </span>
  );
}
