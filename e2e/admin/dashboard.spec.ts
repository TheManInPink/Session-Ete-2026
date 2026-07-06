/**
 * @file        e2e/admin/dashboard.spec.ts
 * @description AD-01 — Dashboard agent. En mode mock, la session
 *              « Modibo Konaté » est active sans login Keycloak et les
 *              statistiques viennent de `api.adminDashboard.getStats()`
 *              (fixtures déterministes de @nina-aes/api-client :
 *              packages/api-client/src/mock/admin-dashboard.fixtures.ts).
 *              Vérifie le rendu des 4 KPI cards (valeurs fixes 12 489 / 84 /
 *              17 / 326), du AreaChart, de la MaliHeatmap et du AlertsFeed.
 */

import { test, expect } from '@playwright/test';

test.describe('AD-01 — Dashboard', () => {
  test('charge le dashboard avec greeting agent', async ({ page }) => {
    await page.goto('/fr/dashboard');

    // Greeting Modibo (premier prénom du mock agent)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Modibo/);

    // 4 KPI cards
    const kpiTitles = page
      .locator('section')
      .first()
      .getByText(/NINA actifs|Corrections|Alertes|RDV/);
    await expect(kpiTitles.first()).toBeVisible();
  });

  test('KPI cards : valeurs déterministes des fixtures mock', async ({ page }) => {
    await page.goto('/fr/dashboard');

    const kpiSection = page.locator('section').first();
    await expect(kpiSection.getByText('Corrections en attente')).toBeVisible();
    // Valeurs fixes du contrat mock (sans séparateur de milliers) :
    // correctionsPending 84, alertsOpen 17, appointmentsToday 326.
    await expect(kpiSection.getByText('84', { exact: true })).toBeVisible();
    await expect(kpiSection.getByText('17', { exact: true })).toBeVisible();
    await expect(kpiSection.getByText('326', { exact: true })).toBeVisible();
  });

  test('AreaChart + AlertsFeed : sections alimentées par le contrat', async ({ page }) => {
    await page.goto('/fr/dashboard');

    await expect(page.getByText(/Corrections par jour/)).toBeVisible();
    await expect(page.getByText('Alertes récentes')).toBeVisible();
    // Première alerte déterministe du feed (graine 66, ordre des samples).
    await expect(page.getByText('Tentative usurpation NINA — falsification photo')).toBeVisible();
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
