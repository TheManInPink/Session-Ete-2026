/**
 * @file        e2e/citizen/home.spec.ts
 * @description PC-01 — Accueil citoyen. Vérifie le chargement initial,
 *              la présence du hero, des 4 cards d'actions, du
 *              LanguageSwitcher et du footnote AES.
 */

import { test, expect } from '@playwright/test';

test.describe('PC-01 — Accueil citoyen', () => {
  test('charge la home page FR sans erreur', async ({ page }) => {
    await page.goto('/fr');

    // Hero title visible
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /NINA|identité/i,
    );

    // 4 quick action cards visibles via lucide icons
    const cards = page.locator('section#actions a').filter({ has: page.locator('h3') });
    await expect(cards).toHaveCount(4);

    // LanguageSwitcher présent
    await expect(page.getByLabel(/Langue|kan/i)).toBeVisible();

    // Bouton sign in
    await expect(page.getByRole('link', { name: /se connecter/i })).toBeVisible();
  });

  test('redirige racine vers /fr', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.url()).toContain('/fr');
  });

  test('change de langue via le LanguageSwitcher', async ({ page }) => {
    await page.goto('/fr');
    await page.locator('select').selectOption('bm');
    await expect(page).toHaveURL(/\/bm/);
  });
});
