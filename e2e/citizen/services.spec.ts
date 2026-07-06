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
  test('affiche le formulaire avec des créneaux (centre CTDEC)', async ({ page }) => {
    await page.goto('/fr/appointments/new');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Prendre un rendez-vous' }),
    ).toBeVisible();
    // Les créneaux (mock) arrivent côté client via React Query.
    await expect(page.getByText('CTDEC Bamako').first()).toBeVisible();
  });

  test('réserve un créneau et affiche la confirmation (mode mock)', async ({ page }) => {
    await page.goto('/fr/appointments/new');

    // 1) Sélectionner le premier créneau disponible.
    const firstSlot = page.getByRole('radio').first();
    await firstSlot.waitFor();
    await firstSlot.check();

    // 2) Motif (≥ 5 caractères).
    await page.locator('#reason').fill('Récupération de ma fiche signée');

    // 3) Confirmer.
    await page.locator('button[type="submit"]').click();

    // 4) Modale de confirmation.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Rendez-vous confirmé')).toBeVisible();
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

  test('soumet un signalement et affiche le token de suivi (mode mock)', async ({ page }) => {
    await page.goto('/fr/signalement');

    // 1) Choisir une catégorie (premier bouton radio).
    await page.getByRole('radio').first().check();

    // 2) Description ≥ 200 caractères (le formulaire de dépôt scellé exige un
    //    récit circonstancié — cf. `canSubmit` de whistleblower-form.tsx).
    await page
      .locator('#description')
      .fill(
        'Description de test pour le signalement anonyme. Je rapporte ici des faits présumés de corruption ' +
          'observés dans un centre d’état civil, avec suffisamment de détails circonstanciés pour dépasser ' +
          'le seuil de deux cents caractères imposé par le formulaire de dépôt sécurisé du canal SIGAC.',
      );

    // 3) Consentement obligatoire.
    await page.getByRole('checkbox').check();

    // 4) Soumettre.
    await page.locator('button[type="submit"]').click();

    // 5) Le reçu confirme le dépôt et affiche le token de suivi anonyme
    //    (token opaque base64url `secrets.token_urlsafe`, PAS un ciphertext
    //    Vault `vault:v3:` — cf. WhistleblowerReceiptSchema + mock).
    await expect(page.getByText(/Signalement enregistré/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /copier le token/i })).toBeVisible();
  });
});
