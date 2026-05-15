/**
 * @file        index.ts
 * @description Stub temporaire du logger structuré NINA-AES.
 *
 *              Ce package est référencé par plusieurs services (api-gateway,
 *              biometric-service, enrollment-service, ussd-service) pour
 *              respecter la pré-déclaration des dépendances workspace.
 *              L'implémentation réelle (Pino + transport Loki + sanitisation
 *              automatique des PII) sera livrée au **document 17 — Monitoring
 *              & Observability**.
 *
 *              En attendant, on expose une API minimale console-backed pour
 *              que les services puissent compiler et démarrer.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/logger
 */

/** Niveaux de log supportés (alignés sur Pino). */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Interface minimale d'un logger. */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Crée un logger console minimal taggé avec un nom de service.
 *
 * @param service - Nom du service appelant (ex. `"api-gateway"`).
 * @returns Instance {@link Logger} backed par `console`.
 */
export function createLogger(service: string): Logger {
  const stamp = (level: LogLevel) =>
    `[${new Date().toISOString()}] [${service}] [${level.toUpperCase()}]`;
  return {
    debug: (m, meta) => console.debug(stamp('debug'), m, meta ?? ''),
    info: (m, meta) => console.info(stamp('info'), m, meta ?? ''),
    warn: (m, meta) => console.warn(stamp('warn'), m, meta ?? ''),
    error: (m, meta) => console.error(stamp('error'), m, meta ?? ''),
  };
}

export default createLogger;
