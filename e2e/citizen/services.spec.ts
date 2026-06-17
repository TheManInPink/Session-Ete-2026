/**
 * @file        services.spec.ts
 * @description Specs d'assertion des services citoyen non couverts par
 *              home.spec / nina-flow : connexion, PC-04 (prise de rendez-vous),
 *              PC-05 (tableau de bord / suivi) et PC-06 (signalement anonyme).
 *              Mode mock (NINA_AUTH_MODE=mock) : session « Fatoumata Diallo ».
 *
 * @module      @nina-aes/citizen
 */

import { test, expect } from '@playwright/test';

test.describe('Citoyen — connexion', () => {
  test('la page de connexion répond et affiche un titre', async ({ page }) => {
    const res = await page.goto('/fr/login');
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('PC-04 — Prise de rendez-vous', () => {
  test('affiche le formulaire avec les centres mock', async ({ page }) => {
    await page.goto('/fr/appointments/new');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Prendre un rendez-vous' }),
    ).toBeVisible();
    await expect(page.getByText('CTDEC Bamako').first()).toBeVisible();
  });
});

test.describe('PC-05 — Tableau de bord / suivi', () => {
  test('affiche le greeting citoyen et la section des corrections', async ({ page }) => {
    await page.goto('/fr/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Bonjour' })).toContainText(
      'Fatoumata',
    );
    await expect(page.getByText('Corrections en cours').first()).toBeVisible();
  });
});

test.describe('PC-06 — Signalement anonyme', () => {
  test('affiche le formulaire anonyme et ses catégories', async ({ page }) => {
    await page.goto('/fr/signalement');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Signaler un fait de corruption' }),
    ).toBeVisible();
    await expect(page.getByText(/Mode anonyme actif/).first()).toBeVisible();
    await expect(page.getByText('Abus de pouvoir').first()).toBeVisible();
  });
});
