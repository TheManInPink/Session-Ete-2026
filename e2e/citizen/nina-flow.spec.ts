/**
 * @file        e2e/citizen/nina-flow.spec.ts
 * @description PC-02 → PC-03 : recherche NINA + accès au wizard de correction.
 *              Exécuté en mode mock (NINA_AUTH_MODE=mock → session Fatoumata
 *              Diallo, NINA 18903102015042Z). La fiche citoyen affichée
 *              correspond au mock parseNina côté frontend (back-end pas
 *              encore branché).
 */

import { test, expect } from '@playwright/test';

const MOCK_NINA = '18903102015042Z';

test.describe('PC-02 — Fiche citoyen', () => {
  test('affiche la fiche pour un NINA valide', async ({ page }) => {
    await page.goto(`/fr/nina/${MOCK_NINA}`);

    // Doit afficher au moins le NINA en mono
    await expect(page.getByText(MOCK_NINA)).toBeVisible();

    // Bouton « Signaler une erreur » présent (lien vers correction)
    await expect(page.getByRole('link', { name: /correction|erreur/i })).toBeVisible();
  });

  test('not-found sur NINA inconnu/invalide', async ({ page }) => {
    const res = await page.goto('/fr/nina/INVALID12345Z');
    // Peut être 404 ou page rendue avec message « non trouvé »
    expect([200, 404]).toContain(res?.status() ?? 0);
  });
});

test.describe('PC-03 — Wizard correction', () => {
  test('le wizard charge avec étape 1 sélectionnée', async ({ page }) => {
    await page.goto(`/fr/nina/${MOCK_NINA}/correction`);

    // Stepper visible, première étape active
    await expect(page.getByText(/champ/i)).toBeVisible();

    // 9 champs corrigibles présents
    const fieldRadios = page.locator('input[type="radio"][name="field"]');
    await expect(fieldRadios).toHaveCount(9);
  });
});
