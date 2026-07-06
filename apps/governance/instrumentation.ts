/**
 * @file        instrumentation.ts
 * @description Hook de démarrage Next.js — exécuté une fois au boot du serveur.
 *
 *              Applique le **kill-switch** de sécurité : interdit le mode données
 *              `mock` en production (fail-closed). Voir `lib/api/config.ts`.
 *
 * @module      @nina-aes/governance
 */

export async function register(): Promise<void> {
  const { assertApiModeSafe } = await import('./lib/api/config');
  assertApiModeSafe();
}
