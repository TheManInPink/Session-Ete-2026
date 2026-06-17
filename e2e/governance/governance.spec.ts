/**
 * @file        governance.spec.ts
 * @description Specs d'assertion du portail GOUVERNANCE (port 4003, mode mock).
 *
 *              Couvre la connexion + les 2 modules réels (GOV-01 messagerie
 *              signée, GOV-02 directives Kanban) + les 2 stubs honnêtes
 *              (performance, rapports) + la sidebar SGOGT. En mode mock
 *              (NINA_AUTH_MODE=mock), une session « haut fonctionnaire » rend
 *              les routes du segment (authenticated)/ sans Keycloak.
 *
 * @module      @nina-aes/governance
 */

import { test, expect } from '@playwright/test';

test.describe('Gouvernance — connexion', () => {
  test('la page de connexion répond et affiche un titre', async ({ page }) => {
    const res = await page.goto('/fr/login');
    expect(res?.status() ?? 0).toBeLessThan(400);
    // Mode mock : soit le formulaire Keycloak s'affiche, soit on est déjà
    // redirigé vers un écran authentifié — les deux ont un h1.
    await expect(page.locator('h1').first()).toBeVisible();
  });
});

test.describe('GOV-01 — Messagerie officielle signée', () => {
  test('affiche la messagerie 3 colonnes (sidebar + recherche)', async ({ page }) => {
    await page.goto('/fr/messagerie');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Conversations' })).toBeVisible();
    await expect(page.getByPlaceholder(/Rechercher une conversation/)).toBeVisible();
  });
});

test.describe('GOV-02 — Directives (Kanban)', () => {
  test('affiche le titre et les 5 colonnes du tableau', async ({ page }) => {
    await page.goto('/fr/directives');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Suivi des directives' }),
    ).toBeVisible();
    for (const col of ['Brouillon', 'Envoyée', 'En cours', 'Terminée', 'Escaladée']) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('Gouvernance — stubs honnêtes', () => {
  test('Performance est un « module en préparation »', async ({ page }) => {
    await page.goto('/fr/performance');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Performance institutionnelle' }),
    ).toBeVisible();
    await expect(page.getByText('Module en préparation').first()).toBeVisible();
  });

  test('Rapports est un « module en préparation »', async ({ page }) => {
    await page.goto('/fr/rapports');
    await expect(page.getByRole('heading', { level: 1, name: 'Rapports' })).toBeVisible();
    await expect(page.getByText('Module en préparation').first()).toBeVisible();
  });
});

test.describe('Gouvernance — sidebar SGOGT', () => {
  test('la navigation contient les 4 sections', async ({ page }) => {
    await page.goto('/fr/messagerie');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const item of ['Messagerie', 'Directives', 'Performance', 'Rapports']) {
      await expect(nav.getByRole('link', { name: item })).toBeVisible();
    }
  });
});
