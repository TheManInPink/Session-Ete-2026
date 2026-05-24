/**
 * @file        correlation.ts
 * @description Propagation transparente du `correlationId` à travers tout le
 *              cycle de vie d'une requête grâce à `AsyncLocalStorage`.
 *
 *              POURQUOI : sans corrélation, tracer un parcours citoyen
 *              traversant 6 services (api-gateway → identity → ai-service →
 *              audit → notification → SIGAC) est un casse-tête. Le passage
 *              de l'ID en paramètre dans toutes les fonctions est invasif et
 *              oublié dès qu'on appelle du code tiers. AsyncLocalStorage
 *              résout ça : on stocke le contexte au début de la requête,
 *              n'importe quelle fonction descendante peut le lire sans
 *              modifier sa signature.
 *
 *              IMPLÉMENTATION : on encapsule un `AsyncLocalStorage<LogContext>`
 *              et expose deux helpers : `runWithContext` (à appeler en
 *              entrée de requête) et `getContext` (à appeler n'importe où).
 *
 * @module      @nina-aes/logger/correlation
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { v7 as uuidv7 } from 'uuid';
import type { LogContext } from './types.js';

/**
 * Storage global du contexte. Volontairement instancié module-scope :
 * tous les imports de ce module partagent la même instance, ce qui est
 * INDISPENSABLE pour que la corrélation fonctionne entre fichiers.
 *
 * NE PAS exposer directement — uniquement les helpers ci-dessous, qui
 * imposent un usage cohérent.
 */
const storage = new AsyncLocalStorage<LogContext>();

/**
 * Exécute `fn` dans une portée où `getContext()` retourne le contexte fourni.
 *
 * QUOI : démarre une nouvelle chaîne de corrélation. À appeler une seule fois
 * en entrée de requête HTTP, en consumer RabbitMQ, ou en handler USSD.
 *
 * POURQUOI : sans ça, `getContext()` retournerait `undefined` et chaque log
 * serait orphelin. C'est l'unique point où on injecte le contexte.
 *
 * @param context - Contexte initial (correlationId, service, userId optionnel).
 * @param fn - Callback à exécuter dans la portée du contexte.
 * @returns Le retour de `fn`.
 *
 * @example
 *   app.use((req, res, next) => {
 *     const correlationId = req.headers['x-request-id'] ?? generateCorrelationId();
 *     runWithContext({ correlationId, service: 'api-gateway' }, () => next());
 *   });
 */
export function runWithContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Récupère le contexte courant, ou `undefined` si appelé hors de toute
 * portée `runWithContext`.
 *
 * Cas typique d'undefined : code de bootstrap au démarrage du service,
 * jobs cron qui ne démarrent pas une "requête" classique. Dans ces cas,
 * il faut explicitement créer un contexte ad hoc (ex. correlationId =
 * `boot-${service}` ou `cron-${jobName}-${timestamp}`).
 */
export function getContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * Génère un nouvel identifiant de corrélation au format UUID v7.
 *
 * POURQUOI UUID v7 plutôt que v4 :
 * - v7 est lexicographiquement triable par timestamp embarqué — utile pour
 *   ordonner les logs dans Loki sans clé secondaire.
 * - v7 garde l'unicité forte de v4 (122 bits aléatoires).
 * - Standard RFC 9562 stable depuis 2024.
 */
export function generateCorrelationId(): string {
  return uuidv7();
}

/**
 * Mute le contexte courant (ajoute / remplace des champs) sans démarrer une
 * nouvelle chaîne. Utile quand on apprend l'identité utilisateur APRÈS le
 * début de la requête (ex. après validation JWT dans api-gateway).
 *
 * @param patch - Champs à fusionner dans le contexte courant.
 * @throws Error si appelé hors d'une portée `runWithContext`.
 */
export function patchContext(patch: Partial<LogContext>): void {
  const current = storage.getStore();
  if (!current) {
    throw new Error(
      'patchContext() appelé hors de toute portée runWithContext. ' +
        'Vérifier que le middleware de corrélation est bien monté en premier.',
    );
  }
  Object.assign(current, patch);
}
