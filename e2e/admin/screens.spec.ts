/**
 * @file        screens.spec.ts
 * @description Specs d'assertion des écrans admin non couverts par
 *              dashboard.spec / corrections.spec : connexion, AD-03 (dashboard
 *              SIGAC anti-corruption, branché sur `getStats()` +
 *              `useWhistleblowerQueue` du mock api-client) et les écrans
 *              secondaires (Rendez-vous stub, Paramètres en lecture seule).
 *              Mode mock : agent « Modibo Konaté ».
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

  test('file procureur : 6 signalements scellés (buckets, aucun contenu)', async ({ page }) => {
    await page.goto('/fr/sigac');

    await expect(page.getByText('File des signalements scellés')).toBeVisible();

    // 6 signalements déterministes dans le mock (buildWhistleblowerQueue).
    const queue = page.getByRole('list', { name: 'Signalements scellés' });
    await expect(queue.getByRole('listitem')).toHaveCount(6);

    // Champs du schéma exposés tels quels : bucket, statut, jour de réception.
    await expect(queue.getByText('En instruction')).toBeVisible();
    await expect(queue.getByText('2026-05-30')).toBeVisible();
    await expect(queue.getByText('Finances / abus de pouvoir').first()).toBeVisible();
  });

  test('file procureur : filtre sévérité « Élevée / critique » → 3 signalements', async ({
    page,
  }) => {
    await page.goto('/fr/sigac');
    const queue = page.getByRole('list', { name: 'Signalements scellés' });
    await expect(queue.getByRole('listitem')).toHaveCount(6);

    await page.getByRole('button', { name: 'Sévérité' }).click();
    await page.getByRole('menuitem', { name: 'Élevée / critique' }).click();
    await page.keyboard.press('Escape');

    // Fixtures HIGH_CRIT : wb-report-1, wb-report-3, wb-report-6.
    await expect(queue.getByRole('listitem')).toHaveCount(3);
  });
});

test.describe('Admin — écrans secondaires', () => {
  test('Rendez-vous affiche un écran mock (données de démonstration)', async ({ page }) => {
    await page.goto('/fr/appointments');
    await expect(page.getByRole('heading', { level: 1, name: 'Rendez-vous' })).toBeVisible();
    // Écran réécrit en vrai mock déterministe : bannière « données de démonstration »
    // (le stub « module en préparation » n'existe plus).
    await expect(page.getByText('Données de démonstration').first()).toBeVisible();
  });

  test('Paramètres affiche le profil agent en lecture seule', async ({ page }) => {
    await page.goto('/fr/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
    await expect(page.getByText('Profil agent').first()).toBeVisible();
    await expect(page.getByText('Édition à venir').first()).toBeVisible();
  });
});
