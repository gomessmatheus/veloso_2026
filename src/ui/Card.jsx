/**
 * src/ui/Card.jsx
 * Card primitivo do design system Ranked.
 *
 * Uso:
 *   <Card padding="md" elevation="xs">…</Card>
 *   <Card padding="lg" elevation="none" bordered>…</Card>
 */

import { t } from '../lib/theme.js';

const PADDING = {
  none: '0',
  sm:   t.space[3],  // 12px
  md:   t.space[4],  // 16px
  lg:   t.space[6],  // 24px
};

/**
 * @param {{
 *   padding?: 'none'|'sm'|'md'|'lg',
 *   elevation?: 'none'|'xs'|'sm'|'md',
 *   bordered?: boolean,
 *   children: React.ReactNode,
 *   style?: object,
 *   onClick?: Function,
 * }} props
 */
export function Card({
  padding   = 'md',
  elevation = 'none',
  bordered  = true,
  children,
  style: extraStyle,
  onClick,
  ...rest
}) {
  // Spec: if elevation !== 'none', force bordered = false
  const showBorder = elevation === 'none' ? bordered : false;

  return (
    <div
      onClick={onClick}
      style={{
        background:   t.color.neutral[0],
        borderRadius: t.radius.lg,
        border:       showBorder ? t.border.thin : 'none',
        boxShadow:    elevation !== 'none' ? t.shadow[elevation] : 'none',
        padding:      PADDING[padding] || PADDING.md,
        cursor:       onClick ? 'pointer' : undefined,
        boxSizing:    'border-box',
        ...extraStyle,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
