/**
 * @file        e2e/admin/corrections.spec.ts
 * @description AD-02 — DataGrid corrections branché sur le mock stateful de
 *              @nina-aes/api-client (50 demandes déterministes : 31
 *              UNDER_REVIEW, 10 APPROVED, 9 REJECTED — cf.
 *              packages/api-client/src/mock/corrections.fixtures.ts).
 *
 *              Parcours critiques couverts :
 *                - chargement (50 demandes, pagination 10 par page)
 *                - filtre statut UNDER_REVIEW → 31 résultats
 *                - drawer fidèle au contrat (score IA réel 87, pas de
 *                  sous-scores inventés)
 *                - approbation bout-en-bout (mock stateful → statut mis à jour)
 *                - rejet : motif < 20 caractères refusé, ≥ 20 accepté
 */

import { test, expect } from '@playwright/test';

/**
 * NINA de la fixture citoyenne historique : 2 demandes dans le magasin mock —
 * birthPlace → « Sikasso » (UNDER_REVIEW, score IA 87 HIGH, 2026-05-10) puis
 * profession → « Couturière » (APPROVED, 2026-04-22).
 */
const CITIZEN_NINA = '18903102015042V';

test.describe('AD-02 — DataGrid corrections', () => {
  test('charge la page : 50 demandes, 10 lignes par page', async ({ page }) => {
    await page.goto('/fr/corrections');

    await expect(page.getByRole('heading', { name: /demandes de correction/i })).toBeVisible();
    // Compteur d'en-tête lu côté serveur (fetchCorrectionsPage → total 50).
    await expect(page.getByText(/50 demandes/)).toBeVisible();

    // Pagination TanStack Table à 10 lignes par page sur 50 au total.
    await expect(page.locator('table tbody tr')).toHaveCount(10);
    await expect(page.getByText(/sur 50/)).toBeVisible();
  });

  test('filtre statut UNDER_REVIEW → 31 demandes (fixtures déterministes)', async ({ page }) => {
    await page.goto('/fr/corrections');
    await expect(page.locator('table tbody tr')).toHaveCount(10);

    // Deux boutons « Statut » existent : (1) toolbar dropdown, (2) header
    // de tri de la colonne Statut dans le tableau. On cible le premier
    // via `.first()` (la toolbar est rendue avant le tableau).
    await page.getByRole('button', { name: 'Statut' }).first().click();

    // Le menu DropdownMenu de Radix utilise role="menuitem"
    await page.getByRole('menuitem', { name: /en revue/i }).click();
    await page.keyboard.press('Escape');

    // 31 demandes UNDER_REVIEW dans le magasin mock.
    await expect(page.getByText(/sur 31/)).toBeVisible();
  });

  test('drawer : détail fidèle au contrat, sans sous-scores inventés', async ({ page }) => {
    await page.goto('/fr/corrections');

    // Recherche déterministe : les 2 demandes de la fixture citoyenne.
    await page.getByRole('searchbox').fill(CITIZEN_NINA);
    await expect(page.locator('table tbody tr')).toHaveCount(2);

    // 1re ligne (tri submittedAt desc) = birthPlace UNDER_REVIEW, score 87.
    await page.locator('table tbody tr').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // AiScorePanel : on cible le `<h3>Score IA</h3>` précisément via le
    // rôle heading (sinon collision avec « Score IA calculé » de la
    // timeline qui contient aussi le texte).
    await expect(dialog.getByRole('heading', { name: 'Score IA' })).toBeVisible();
    await expect(dialog.getByText('87', { exact: true })).toBeVisible();

    // Dégradation honnête : les sous-scores IA détaillés n'ont aucune source
    // backend — ils ne doivent plus apparaître.
    await expect(dialog.getByText('Fuzzy match')).toHaveCount(0);
    await expect(dialog.getByText('Cohérence')).toHaveCount(0);

    // Valeurs avant / après de la fixture.
    await expect(dialog.getByText('Sikasso')).toBeVisible();

    // Boutons d'action en footer du drawer (demande encore décidable).
    await expect(dialog.getByRole('button', { name: /approuver/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /rejeter/i })).toBeVisible();
  });

  test('flux approbation bout-en-bout : drawer → approuver → statut mis à jour', async ({
    page,
  }) => {
    await page.goto('/fr/corrections');

    await page.getByRole('searchbox').fill(CITIZEN_NINA);
    const firstRow = page.locator('table tbody tr').first();
    await expect(page.locator('table tbody tr')).toHaveCount(2);
    await expect(firstRow).toContainText('En revue');

    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /approuver/i }).click();

    // Toast de succès + fermeture du drawer.
    await expect(page.getByText('Correction approuvée')).toBeVisible();
    await expect(dialog).toBeHidden();

    // Le mock est stateful : l'invalidation TanStack Query re-fetch la liste
    // et la ligne reflète la décision.
    await expect(firstRow).toContainText('Approuvée');
  });

  test('rejet : motif < 20 caractères refusé, ≥ 20 accepté', async ({ page }) => {
    await page.goto('/fr/corrections');

    await page.getByRole('searchbox').fill(CITIZEN_NINA);
    const firstRow = page.locator('table tbody tr').first();
    await expect(page.locator('table tbody tr')).toHaveCount(2);
    await expect(firstRow).toContainText('En revue');

    await firstRow.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /rejeter/i }).click();

    // Motif trop court (10 caractères) : bouton désactivé + erreur affichée.
    const textarea = dialog.getByLabel(/motif de rejet/i);
    await textarea.fill('Trop court');
    const submit = dialog.getByRole('button', { name: /rejeter/i });
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText(/au moins 20 caractères/)).toBeVisible();

    // Motif valide (≥ 20 caractères, contrainte RejectCorrectionDto backend).
    await textarea.fill('Justificatif illisible, merci de fournir un nouveau scan.');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Correction rejetée')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(firstRow).toContainText('Rejetée');
  });
});
