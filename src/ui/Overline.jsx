/**
 * Overline — label uppercase estilo eyebrow/section header.
 *
 * Padrão consolidado: 18+ ocorrências no app com semântica idêntica.
 * Criado na consolidação da escala tipográfica (Fase 7.5).
 *
 * @tokens
 *   ds.font.size.xs        ('11px')
 *   ds.font.weight.semibold (600)
 *   ds.font.letterSpacing.widest ('0.12em') — padrão
 *   ds.font.lineHeight.tight (1.2)
 *   ds.color.neutral[500]  — cor padrão; sobrescrevível via prop
 *
 * @migrate-to-tailwind Fase 13
 *   text-[11px]     → (custom, 11px ≠ text-xs 12px)
 *   font-semibold   → font-semibold
 *   uppercase       → uppercase
 *   tracking-[0.12em] → tracking-widest (aprox.)
 *
 * @example
 *   <Overline>Navegação</Overline>
 *   <Overline color={ds.color.success[500]} mb={ds.space[3]}>✓ Pontos positivos</Overline>
 *   <Overline as="label" htmlFor="field-id">Valor do contrato</Overline>
 */
import { theme as ds } from '../lib/theme.js'; // fix: era `t as ds` — t é helper CSS, não os tokens
/**
 * @param {{
 *   children:   React.ReactNode,
 *   color?:     string,              // token ds.color.* — default neutral[500]
 *   mb?:        string,              // token ds.space.* para marginBottom
 *   as?:        string,              // tag HTML — default 'div'
 *   style?:     object,
 *   [key]:      any,                 // props passadas ao elemento (htmlFor, etc.)
 * }} props
 */
export function Overline({ children, color, mb, as: Tag = 'div', style: extraStyle, ...rest }) {
  return (
    <Tag
      style={{
        fontSize:      ds.font.size.xs,
        fontWeight:    ds.font.weight.semibold,
        letterSpacing: ds.font.letterSpacing.widest,
        textTransform: 'uppercase',
        lineHeight:    ds.font.lineHeight.tight,
        color:         color ?? ds.color.neutral[500],
        marginBottom:  mb ?? undefined,
        ...extraStyle,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
