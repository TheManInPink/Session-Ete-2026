/**
 * @file        capture.spec.ts
 * @description Capture d'écran reproductible du portail GOUVERNANCE pour le
 *              dossier de soutenance (docs/soutenance/screenshots/governance/).
 *
 *              Mode MOCK (NINA_AUTH_MODE=mock, fixé par le webServer Playwright) :
 *              session déterministe « haut fonctionnaire Général Issa Ousmane Coulibaly », ce qui
 *              débloque les routes du segment (authenticated)/ sans Keycloak.
 *
 *              Exécution (depuis la racine du repo) :
 *                CAPTURE=1 pnpm exec playwright test e2e/governance/capture.spec.ts
 *
 * @module      @nina-aes/governance
 */

import { test } from '@playwright/test';

/** Désactive les specs de capture hors d'un run explicite `CAPTURE=1`. */
// eslint-disable-next-line turbo/no-undeclared-env-vars -- var de test Playwright (runtime), hors globalEnv turbo
test.skip(!process.env.CAPTURE, 'Spec de capture — lancer avec CAPTURE=1');

/** Viewport « desktop soutenance » (HD ×2) pour des captures nettes. */
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const SHOTS: Array<{ name: string; route: string; width?: number }> = [
  { name: 'gov-login-fr', route: '/fr/login' },
  { name: 'gov-01-messagerie-fr', route: '/fr/messagerie' },
  { name: 'gov-02-directives-fr', route: '/fr/directives', width: 1800 },
  { name: 'gov-performance-fr', route: '/fr/performance' },
  { name: 'gov-rapports-fr', route: '/fr/rapports' },
];

for (const shot of SHOTS) {
  test(`governance ${shot.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    if (shot.width) await page.setViewportSize({ width: shot.width, height: 900 });
    await page.goto(shot.route, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: `docs/soutenance/screenshots/governance/${shot.name}.png`,
      fullPage: true,
    });
  });
}
