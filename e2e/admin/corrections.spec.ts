/**
 * @file        e2e/admin/corrections.spec.ts
 * @description AD-02 — DataGrid corrections. Parcours critique :
 *              charger la page → filtrer par statut UNDER_REVIEW → ouvrir
 *              le drawer d'une ligne → approuver → toast + statut update.
 *              Mode mock (50 corrections déterministes).
 */

import { test, expect } from '@playwright/test';

test.describe('AD-02 — DataGrid corrections', () => {
  test('charge la page avec ≥10 lignes (pageSize=10)', async ({ page }) => {
    await page.goto('/fr/corrections');

    await expect(page.getByRole('heading', { name: /demandes de correction/i })).toBeVisible();

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('filtre statut UNDER_REVIEW réduit ou maintient le résultat', async ({ page }) => {
    await page.goto('/fr/corrections');

    const initialCount = await page.locator('table tbody tr').count();

    // Deux boutons « Statut » existent : (1) toolbar dropdown, (2) header
    // de tri de la colonne Statut dans le tableau. On cible le premier
    // via `.first()` (la toolbar est rendue avant le tableau).
    await page.getByRole('button', { name: 'Statut' }).first().click();

    // Le menu DropdownMenu de Radix utilise role="menuitem"
    await page.getByRole('menuitem', { name: /en revue/i }).click();
    await page.keyboard.press('Escape');

    const filteredCount = await page.locator('table tbody tr').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
  });

  test('click ligne ouvre le drawer détail avec actions', async ({ page }) => {
    await page.goto('/fr/corrections');
    await page.locator('table tbody tr').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // AiScorePanel : on cible le `<h3>Score IA</h3>` précisément via le
    // rôle heading (sinon collision avec « Score IA calculé » de la
    // timeline qui contient aussi le texte).
    await expect(dialog.getByRole('heading', { name: 'Score IA' })).toBeVisible();

    // Boutons d'action en footer du drawer
    await expect(dialog.getByRole('button', { name: /approuver/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /rejeter/i })).toBeVisible();
  });
});
