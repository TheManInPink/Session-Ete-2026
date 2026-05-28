/**
 * @file        format-nina.helper.ts
 * @description Helper Handlebars qui formate un NINA brut en groupes lisibles.
 *
 *              "19850315123456A" → "1 98 50 3 15 123 456 A"
 *                                  X YY ZZ Z ZZ ZZZ ZZZ A
 *                                  │ │  │  │ │  │   │   └─ lettre contrôle
 *                                  │ │  │  │ │  │   └────  séquentiel
 *                                  │ │  │  │ │  └─ commune
 *                                  │ │  │  │ └─ cercle
 *                                  │ │  │  └─ région
 *                                  │ │  └─ mois naissance
 *                                  │ └─ année naissance
 *                                  └─ sexe (1=H, 2=F)
 *
 * @module      document-service/templates/helpers
 */
export function formatNinaHelper(nina: unknown): string {
  if (typeof nina !== 'string' || !/^\d{14}[A-Z]$/.test(nina)) {
    return String(nina ?? '');
  }
  return [
    nina[0],
    nina.slice(1, 3),
    nina.slice(3, 5),
    nina[5],
    nina.slice(6, 8),
    nina.slice(8, 11),
    nina.slice(11, 14),
    nina[14],
  ].join(' ');
}
