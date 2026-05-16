/**
 * @file        playwright.config.ts
 * @description Configuration Playwright pour les tests E2E multi-app.
 *
 *              Deux « projects » Playwright = deux app Next.js démarrées en
 *              parallèle (citizen :4001, admin :4002), chacun avec ses tests.
 *
 *              Mode AUTH : `NINA_AUTH_MODE=mock` pour ces tests — débloque
 *              l'auth sans Keycloak. Les Server Components voient une session
 *              déterministe (Fatoumata Diallo côté citizen, Modibo Konaté
 *              côté admin).
 *
 *              Exécution :
 *                pnpm run test:e2e:install   # une fois — télécharge Chromium
 *                pnpm run test:e2e           # lance tous les tests
 *                pnpm run test:e2e:ui        # mode interactif Playwright UI
 *
 *              Filtrer un projet : pnpm run test:e2e --project=citizen
 */

import { defineConfig, devices } from '@playwright/test';

/** Permet de lancer les tests contre un serveur déjà actif (utile en CI). */
const CITIZEN_URL = process.env.E2E_CITIZEN_URL ?? 'http://localhost:4001';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://localhost:4002';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // séquentiel inter-projets (sinon les 2 webServers se marchent dessus)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'citizen',
      testMatch: /citizen\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: CITIZEN_URL,
      },
    },
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_URL,
      },
    },
  ],

  // 2 web servers démarrés par Playwright (ou réutilisés si déjà actifs)
  webServer: [
    {
      command: 'pnpm --filter @nina-aes/citizen dev',
      url: CITIZEN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NINA_AUTH_MODE: 'mock' },
    },
    {
      command: 'pnpm --filter @nina-aes/admin dev',
      url: ADMIN_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NINA_AUTH_MODE: 'mock' },
    },
  ],
});
