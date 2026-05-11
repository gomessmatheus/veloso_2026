/**
 * src/ui/index.js
 * Barrel export do design system Ranked — ponto único de importação.
 *
 * Uso nos consumidores:
 *   import { Button, Icon, Input, Modal, Toggle } from '../ui/index.js';
 *
 * Regras:
 * - Todo componente novo em src/ui/ deve ser adicionado aqui.
 * - Não importar diretamente de src/ui/Button.jsx etc. — sempre via index.
 * - _inject.js é detalhe de implementação: NÃO exportar.
 */
// ── Primitivas ────────────────────────────────────────────
export { Button, IconButton }      from './Button.jsx';
export { Input }                   from './Input.jsx';
export { Select }                  from './Select.jsx';
export { Textarea }                from './Textarea.jsx';
export { Card }                    from './Card.jsx';
export { Badge }                   from './Badge.jsx';
export { Icon }                    from './Icon.jsx';
export { Modal }                   from './Modal.jsx';
export { Toggle }                  from './Toggle.jsx';
export { Skeleton, DashboardSkeleton, TableSkeleton, PipelineSkeleton } from './Skeleton.jsx';
export { CurrencyRateBadge }       from './CurrencyRateBadge.jsx';
export { Overline }                from './Overline.jsx';
// ── Tokens (re-export para conveniência) ──────────────────
export { theme, t, css }           from '../lib/theme.js';
