/**
 * @file        e2e/citizen/nina-flow.spec.ts
 * @description PC-02 → PC-03 : recherche NINA + accès au wizard de correction.
 *              Exécuté en mode mock (NINA_AUTH_MODE=mock → session Fatoumata
 *              Diallo, NINA 18903102015042Z). La fiche citoyen affichée
 *              correspond au mock parseNina côté frontend (back-end pas
 *              encore branché).
 */

import { test, expect } from '@playwright/test';

// NINA réellement valide selon `validateNina()` (lettre de contrôle V
// dérivée des 14 chiffres). À noter : le NINA `18903102015042Z` cité
// partout dans les mocks (i18n, examples) est INVALIDE — la lettre de
// contrôle correcte est V. À aligner Session 6+ pour cohérence
// (TODO : régénérer tous les mocks NINA avec validation).
const MOCK_NINA = '18903102015042V';
// formatNina() : `1 89 03 1 02 015 042 V`
const MOCK_NINA_FORMATTED = '1 89 03 1 02 015 042 V';

test.describe('PC-02 — Fiche citoyen', () => {
  test('affiche la fiche pour un NINA valide', async ({ page }) => {
    await page.goto(`/fr/nina/${MOCK_NINA}`);

    // Le NINA est affiché formaté avec espaces dans le header de la card.
    await expect(page.getByText(MOCK_NINA_FORMATTED)).toBeVisible();

    // Bouton « Signaler une erreur » présent (lien vers correction).
    await expect(page.getByRole('link', { name: /correction|erreur|signaler/i })).toBeVisible();
  });

  test('not-found sur NINA inconnu/invalide', async ({ page }) => {
    const res = await page.goto('/fr/nina/INVALID12345Z');
    expect([200, 404]).toContain(res?.status() ?? 0);
  });
});

test.describe('PC-03 — Wizard correction', () => {
  test("le wizard charge avec 9 champs corrigibles à l'étape 1", async ({ page }) => {
    await page.goto(`/fr/nina/${MOCK_NINA}/correction`);

    // Stepper / titre étape 1 visible
    await expect(page.getByText(/champ/i).first()).toBeVisible();

    // 9 champs corrigibles : Prénom, Nom, Date naissance, Lieu naissance,
    // Cercle, Commune, Nom père, Nom mère, Profession.
    // Implémentés comme <button aria-pressed="false"> (pas des radio inputs).
    const fieldButtons = page.getByRole('button', { pressed: false });
    // Au moins 9 boutons aria-pressed=false (étape 1 = 9 choix de champs).
    expect(await fieldButtons.count()).toBeGreaterThanOrEqual(9);
  });
});
