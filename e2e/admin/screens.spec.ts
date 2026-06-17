/**
 * @file        screens.spec.ts
 * @description Specs d'assertion des écrans admin non couverts par
 *              dashboard.spec / corrections.spec : connexion, AD-03 (dashboard
 *              SIGAC anti-corruption) et les écrans secondaires (Rendez-vous
 *              stub, Paramètres en lecture seule). Mode mock : agent « Modibo
 *              Konaté ».
 *
 * @module      @nina-aes/admin
 */

import { test, expect } from '@playwright/test';

test.describe('Agent — connexion', () => {
  test('la page de connexion répond et affiche un titre', async ({ page }) => {
    const res = await page.goto('/fr/login');
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('AD-03 — Dashboard SIGAC', () => {
  test('affiche le titre, la heatmap et le top agents', async ({ page }) => {
    await page.goto('/fr/sigac');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard SIGAC' })).toBeVisible();
    await expect(page.getByText('Alertes par région').first()).toBeVisible();
    await expect(page.getByText(/Top 10 agents/).first()).toBeVisible();
  });
});

test.describe('Admin — écrans secondaires', () => {
  test('Rendez-vous est un stub honnête « module en préparation »', async ({ page }) => {
    await page.goto('/fr/appointments');
    await expect(page.getByRole('heading', { level: 1, name: 'Rendez-vous' })).toBeVisible();
    await expect(page.getByText('Module en préparation').first()).toBeVisible();
  });

  test('Paramètres affiche le profil agent en lecture seule', async ({ page }) => {
    await page.goto('/fr/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
    await expect(page.getByText('Profil agent').first()).toBeVisible();
    await expect(page.getByText('Édition à venir').first()).toBeVisible();
  });
});
