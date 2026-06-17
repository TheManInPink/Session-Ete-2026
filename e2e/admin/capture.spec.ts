/**
 * @file        capture.spec.ts
 * @description Capture d'écran reproductible des écrans du back-office ADMIN pour
 *              le dossier de soutenance (docs/soutenance/screenshots/admin/).
 *
 *              Mode MOCK (NINA_AUTH_MODE=mock, fixé par le webServer Playwright) :
 *              session déterministe « agent CTDEC Modibo Konaté », ce qui débloque
 *              les routes du segment (authenticated)/ sans Keycloak.
 *
 *              Exécution (depuis la racine du repo) :
 *                CAPTURE=1 pnpm exec playwright test e2e/admin/capture.spec.ts
 *
 * @module      @nina-aes/admin
 */

import { test } from '@playwright/test';

/** Désactive les specs de capture hors d'un run explicite `CAPTURE=1`. */
// eslint-disable-next-line turbo/no-undeclared-env-vars -- var de test Playwright (runtime), hors globalEnv turbo
test.skip(!process.env.CAPTURE, 'Spec de capture — lancer avec CAPTURE=1');

/** Viewport « desktop soutenance » (HD ×2) pour des captures nettes. */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const SHOTS: Array<{ name: string; route: string }> = [
  { name: 'ad-login-fr', route: '/fr/login' },
  { name: 'ad-01-dashboard-fr', route: '/fr/dashboard' },
  { name: 'ad-02-corrections-fr', route: '/fr/corrections' },
  { name: 'ad-03-sigac-fr', route: '/fr/sigac' },
  { name: 'ad-appointments-fr', route: '/fr/appointments' },
  { name: 'ad-settings-fr', route: '/fr/settings' },
];

for (const shot of SHOTS) {
  test(`admin ${shot.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(shot.route, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: `docs/soutenance/screenshots/admin/${shot.name}.png`,
      fullPage: true,
    });
  });
}
