/**
 * src/lib/format.js
 * Helpers de formatação de dados — sem dependências externas.
 */

/**
 * Formata uma data para "DD/MM/AAAA" em pt-BR.
 *
 * Aceita:
 *  - string ISO "YYYY-MM-DD"  → tratada como data local (evita bug UTC-3)
 *  - string ISO com hora "YYYY-MM-DDTHH:mm:ssZ"
 *  - instância de Date
 *  - string já formatada "DD/MM/AAAA" → retorna como veio
 *
 * Retorna "" para valores nulos, vazios ou inválidos.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value && value !== 0) return "";

  // Já está no formato BR — devolve como veio
  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value;
  }

  let d;

  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    // "YYYY-MM-DD" sem hora — interpreta como data local para evitar
    // que UTC-3 recue o dia para o dia anterior
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      d = new Date(`${value}T00:00:00`);
    } else {
      d = new Date(value);
    }
  } else {
    return "";
  }

  if (!d || isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  }).format(d);
}
