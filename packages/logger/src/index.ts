/**
 * @file        index.ts
 * @description Point d'entrée principal du package @nina-aes/logger.
 *
 *              ARCHITECTURE :
 *              - `./logger`       — factory Pino centrale (`createLogger`)
 *              - `./types`        — types partagés (LogLevel, LogContext, etc.)
 *              - `./correlation`  — propagation AsyncLocalStorage du correlationId
 *              - `./redaction`    — règles de masquage PII + helpers (maskNina...)
 *              - `./nestjs`       — sous-package NestJS (module, filter, middleware)
 *
 *              RÉTROCOMPATIBILITÉ :
 *              L'ancien stub exposait `createLogger(service: string): Logger`.
 *              La nouvelle API utilise `createLogger(options: CreateLoggerOptions)`.
 *              `createLogger` accepte les DEUX signatures (string OU options)
 *              afin de ne casser aucun import existant. La signature `string`
 *              est marquée @deprecated et sera retirée en v1.0.
 *
 * @author      Étudiant UQAR
 * @date        2026-05-23
 * @version     0.2.0
 * @module      @nina-aes/logger
 */

import { createLogger as createLoggerNew, getFallbackLogger } from './logger.js';
import type { CreateLoggerOptions, StructuredLogger } from './types.js';

// === Types et helpers modernes — à utiliser dans tout nouveau code ===
export { getFallbackLogger } from './logger.js';
export { generateCorrelationId, getContext, patchContext, runWithContext } from './correlation.js';
export { PII_REDACT_PATHS, REDACT_CENSOR, maskEmail, maskNina, maskPhone } from './redaction.js';
export type { CreateLoggerOptions, LogContext, LogLevel, StructuredLogger } from './types.js';

/**
 * Interface minimale historique — gardée pour rétrocompat des consommateurs
 * qui typaient `Logger` depuis le stub précédent.
 *
 * @deprecated Utiliser `StructuredLogger` à la place.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Crée un logger structuré Pino central NINA-AES.
 *
 * SIGNATURE POLYMORPHE pour rétrocompatibilité :
 * - `createLogger('api-gateway')` — ancienne signature (stub)
 * - `createLogger({ service: 'api-gateway', environment: 'production' })` — moderne
 *
 * La signature moderne est REQUISE pour bénéficier de :
 * - masquage PII automatique
 * - propagation de corrélation
 * - export Loki / pino-pretty
 * - intégration NestJS via @nina-aes/logger/nestjs
 *
 * @param arg - Nom de service (legacy) OU options complètes (moderne).
 * @returns Logger structuré Pino enrichi.
 *
 * @example
 *   // Moderne (recommandé)
 *   const logger = createLogger({
 *     service: 'api-gateway',
 *     environment: process.env.NODE_ENV,
 *     pretty: process.env.NODE_ENV === 'development',
 *   });
 *   logger.info({ port: 3000 }, 'Service démarré');
 *
 * @example
 *   // Legacy (encore supporté mais déprécié)
 *   const logger = createLogger('api-gateway');
 *   logger.info('Démarré');
 */
export function createLogger(arg: string | CreateLoggerOptions): StructuredLogger {
  const options: CreateLoggerOptions = typeof arg === 'string' ? { service: arg } : arg;
  return createLoggerNew(options);
}

// Export par défaut = createLogger polymorphe
export default createLogger;

/**
 * Logger global de secours pour les contextes hors DI (scripts CLI, jobs cron
 * avant l'init du module NestJS). À ÉVITER dans le code applicatif.
 */
export const defaultLogger: StructuredLogger = getFallbackLogger();
