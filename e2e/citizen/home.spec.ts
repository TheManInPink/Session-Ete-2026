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
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/NINA|identité/i);

    // 4 quick action cards visibles via lucide icons
    const cards = page.locator('section#actions a').filter({ has: page.locator('h3') });
    await expect(cards).toHaveCount(4);

    // LanguageSwitcher présent
    await expect(page.getByLabel(/Langue|kan/i)).toBeVisible();

    // Session mock authentifiée (Fatoumata Diallo) : l'en-tête rend le menu
    // compte, pas le lien « Se connecter » (réservé à l'anonyme).
    await expect(page.getByRole('button', { name: /mon compte/i })).toBeVisible();
  });

  test('racine `/` redirige vers une locale supportée', async ({ page }) => {
    const res = await page.goto('/');
    // next-intl localePrefix=always : `/` redirige toujours vers `/<locale>`.
    // La locale choisie dépend de l'Accept-Language négocié par le
    // navigateur — on accepte n'importe laquelle des 8 locales AES.
    expect(res?.url()).toMatch(/\/(fr|bm|snk|ff|tmq|hau|mos|dje)(\/|$)/);
  });

  test('change de langue via le LanguageSwitcher', async ({ page }) => {
    await page.goto('/fr');
    // Le LanguageSwitcher n'est pas un <select> natif mais un Popover Radix :
    // bouton déclencheur (aria-label « Langue ») + liste role="listbox"
    // d'options role="option". On l'ouvre puis on choisit Bamanankan (bm).
    await page.getByRole('button', { name: /langue/i }).click();
    await page.getByRole('option', { name: 'Bamanankan' }).click();
    await expect(page).toHaveURL(/\/bm/);
  });
});
