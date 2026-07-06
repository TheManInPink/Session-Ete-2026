/**
 * @file        config.ts
 * @description Configuration de la couche données (mode + URLs gateway).
 *
 *              Isomorphe (serveur RSC + navigateur) : ne lit que `process.env`.
 *              Les variables `NEXT_PUBLIC_*` sont inlinées au build → lisibles
 *              côté client. Miroir d'apps/citizen (ADR-031), ports gouvernance
 *              (app 4003, gateway 3000).
 *
 * @module      @nina-aes/governance
 */

/** Mode d'alimentation des données. */
export type ApiMode = 'mock' | 'live';

/**
 * Résout le mode de données.
 *
 * Priorité : `NEXT_PUBLIC_NINA_API_MODE` explicite, sinon dérivé du drapeau
 * historique `NEXT_PUBLIC_DEMO_MODE`, sinon `mock` (défaut sûr en dev).
 */
export function resolveApiMode(): ApiMode {
  const explicit = process.env.NEXT_PUBLIC_NINA_API_MODE;
  if (explicit === 'live' || explicit === 'mock') return explicit;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'false') return 'live';
  return 'mock';
}

/** Vrai si l'app sert des données synthétiques (bannières « mode démo »). */
export function isMockMode(): boolean {
  return resolveApiMode() === 'mock';
}

/**
 * **Kill-switch de sécurité** (fail-closed).
 *
 * Refuse de démarrer en production si le mode est `mock` : le portail
 * gouvernance servirait de faux messages officiels « signés » et de fausses
 * directives — inacceptable pour un canal de décision inter-institutions.
 * Appelé au boot par `instrumentation.ts`.
 *
 * @throws {Error} si `NODE_ENV=production` et mode `mock`.
 */
export function assertApiModeSafe(): void {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return;

  if (resolveApiMode() === 'mock') {
    throw new Error(
      "[NINA-AES] SÉCURITÉ : le mode données 'mock' est interdit en production. " +
        'Définir NEXT_PUBLIC_NINA_API_MODE=live (et NEXT_PUBLIC_DEMO_MODE=false).',
    );
  }

  // Fail-closed : en prod « live », les URLs gateway doivent être configurées
  // explicitement. Un défaut sur localhost = 100 % d'échecs silencieux.
  const localhostUrls = [gatewayInternalUrl(), gatewayPublicUrl()].filter(
    (u) => u.includes('localhost') || u.includes('127.0.0.1'),
  );
  if (localhostUrls.length > 0) {
    throw new Error(
      '[NINA-AES] SÉCURITÉ : en production, API_BASE_URL et NEXT_PUBLIC_GATEWAY_URL doivent ' +
        'pointer vers le gateway réel (pas localhost). Détecté : ' +
        localhostUrls.join(', '),
    );
  }
}

/** URL interne du gateway (serveur RSC / BFF → gateway). */
export function gatewayInternalUrl(): string {
  return process.env.API_BASE_URL ?? 'http://localhost:3000';
}

/**
 * URL **publique** du gateway. Le portail gouvernance n'a AUCUN transport
 * anonyme (tous les appels sont authentifiés via le BFF) : cette URL ne sert
 * qu'au contrôle de configuration du kill-switch ci-dessus.
 */
export function gatewayPublicUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3000';
}

/** URL publique de l'app — base same-origin des appels authentifiés via BFF. */
export function appPublicUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4003';
}
