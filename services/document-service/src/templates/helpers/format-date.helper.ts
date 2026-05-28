/**
 * @file        format-date.helper.ts
 * @description Helper Handlebars qui formate une date ISO 8601 en chaîne
 *              lisible locale. En P0 : format simple `dd/mm/yyyy` (fr-FR),
 *              identique à la convention CTDEC papier. Les 4 langues
 *              nationales utilisent la même notation chiffrée.
 *
 * @module      document-service/templates/helpers
 */
export function formatDateHelper(value: unknown): string {
  if (!value) return '';
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'string' || typeof value === 'number' ? value : '');
  if (Number.isNaN(date.getTime())) return String(value);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
