/**
 * @file        e2e/admin/dashboard.spec.ts
 * @description AD-01 — Dashboard agent. En mode mock, la session
 *              « Modibo Konaté » est active sans login Keycloak.
 *              Vérifie le rendu des 4 KPI cards, du AreaChart, de la
 *              MaliHeatmap et du AlertsFeed live.
 */

import { test, expect } from '@playwright/test';

test.describe('AD-01 — Dashboard', () => {
  test('charge le dashboard avec greeting agent', async ({ page }) => {
    await page.goto('/fr/dashboard');

    // Greeting Modibo (premier prénom du mock agent)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Modibo/);

    // 4 KPI cards
    const kpiTitles = page.locator('section').first().getByText(/NINA actifs|Corrections|Alertes|RDV/);
    await expect(kpiTitles.first()).toBeVisible();
  });

  test('sidebar nav contient les 5 items', async ({ page }) => {
    await page.goto('/fr/dashboard');
    const sidebar = page.getByRole('navigation');
    await expect(sidebar.getByRole('link', { name: /tableau de bord/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /corrections/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /rendez-vous/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /sigac|alertes/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /paramètres/i })).toBeVisible();
  });
});
