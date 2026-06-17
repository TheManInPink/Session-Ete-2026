/**
 * @file        capture.spec.ts
 * @description Capture d'écran reproductible des écrans du portail CITOYEN pour
 *              le dossier de soutenance (docs/soutenance/screenshots/citizen/).
 *
 *              Ce n'est pas un test d'assertion : chaque "test" navigue vers une
 *              route en mode MOCK (NINA_AUTH_MODE=mock, fixé par le webServer
 *              Playwright) et enregistre une capture plein écran en 1440px.
 *
 *              Exécution (depuis la racine du repo) :
 *                CAPTURE=1 pnpm exec playwright test e2e/citizen/capture.spec.ts
 *
 *              Le garde-fou CAPTURE=1 évite que ces specs tournent dans la CI
 *              normale (pnpm run test:e2e).
 *
 * @module      @nina-aes/citizen
 */

import { test } from '@playwright/test';

/** Désactive les specs de capture hors d'un run explicite `CAPTURE=1`. */
// eslint-disable-next-line turbo/no-undeclared-env-vars -- var de test Playwright (runtime), hors globalEnv turbo
test.skip(!process.env.CAPTURE, 'Spec de capture — lancer avec CAPTURE=1');

/** Viewport « desktop soutenance » (HD ×2) pour des captures nettes. */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

/** NINA de démonstration (déterministe en mode mock). */
const DEMO_NINA = '18903102015042V';

const SHOTS: Array<{ name: string; route: string; width?: number }> = [
  { name: 'pc-01-accueil-fr', route: '/fr' },
  { name: 'login-fr', route: '/fr/login' },
  { name: 'pc-02-fiche-citoyen-fr', route: `/fr/nina/${DEMO_NINA}` },
  { name: 'pc-03-correction-fr', route: `/fr/nina/${DEMO_NINA}/correction` },
  { name: 'pc-04-rendez-vous-fr', route: '/fr/appointments/new' },
  { name: 'pc-05-suivi-fr', route: '/fr/dashboard' },
  { name: 'pc-06-signalement-fr', route: '/fr/signalement' },
  { name: 'pc-01-accueil-bm', route: '/bm' },
  // Captures mobile (responsive) — viewport ~390px.
  { name: 'pc-01-accueil-mobile-fr', route: '/fr', width: 390 },
  { name: 'pc-05-suivi-mobile-fr', route: '/fr/dashboard', width: 390 },
];

for (const shot of SHOTS) {
  test(`citizen ${shot.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    if (shot.width) await page.setViewportSize({ width: shot.width, height: 844 });
    await page.goto(shot.route, { waitUntil: 'load', timeout: 90_000 });
    // Laisse le temps à l'hydratation React et au rendu mock de se stabiliser.
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: `docs/soutenance/screenshots/citizen/${shot.name}.png`,
      fullPage: true,
    });
  });
}

/**
 * Capture de l'étape 3 du wizard de correction (zone d'upload du justificatif).
 * Nécessite de piloter le wizard : champ → valeur + motif → étape justificatif.
 */
test('citizen pc-03-correction-upload-fr', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/fr/nina/${DEMO_NINA}/correction`, { waitUntil: 'load', timeout: 90_000 });

  // Étape 1 — choisir le champ « Nom de famille »
  await page.getByRole('button', { name: 'Nom de famille' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape 2 — nouvelle valeur + motif (≥ 10 caractères pour débloquer « Suivant »)
  await page.fill('#proposedValue', 'COULIBALY');
  await page.fill('#reason', "Erreur de saisie lors de l'enregistrement initial au centre.");
  await page.getByRole('button', { name: 'Suivant' }).click();

  // Étape 3 — zone d'upload du justificatif
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'docs/soutenance/screenshots/citizen/pc-03-correction-upload-fr.png',
    fullPage: true,
  });
});

/**
 * Capture de la modale de confirmation de rendez-vous (avec QR de RDV).
 * Remplit le formulaire (centre + créneau + motif) puis confirme.
 */
test('citizen pc-04-confirmation-fr', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/fr/appointments/new', { waitUntil: 'load', timeout: 90_000 });

  await page.locator('label:has(input[name="center"])').first().click();
  await page.locator('label:has(input[name="slot"])').first().click();
  await page.fill('#reason', 'Récupération de ma fiche descriptive individuelle signée.');
  await page.getByRole('button', { name: 'Confirmer le rendez-vous' }).click();

  // Attendre l'apparition de la modale (rôle dialog) puis capturer
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: 'docs/soutenance/screenshots/citizen/pc-04-confirmation-fr.png',
    fullPage: true,
  });
});
