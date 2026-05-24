/**
 * @file        types.ts
 * @description Définitions de types partagés par tout le package @nina-aes/logger.
 *
 *              POURQUOI : centraliser les contrats (niveaux, options, contextes)
 *              dans un seul fichier permet aux services consommateurs d'importer
 *              uniquement les types sans tirer Pino dans leur graphe — utile
 *              quand un service veut juste typer un paramètre `logger`.
 *
 * @module      @nina-aes/logger/types
 */

import type { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions } from 'pino';

/**
 * Niveaux de log supportés, alignés strictement sur Pino.
 *
 * - `trace` : événements de très bas niveau (boucles internes, parsing fin) — debug profond
 * - `debug` : informations utiles au développeur en cours d'investigation
 * - `info`  : événements métier normaux (création citoyen, soumission correction)
 * - `warn`  : situations anormales mais non bloquantes (cache miss, retry)
 * - `error` : erreurs applicatives nécessitant une attention humaine
 * - `fatal` : erreurs entraînant l'arrêt du service
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Contexte de logging propagé automatiquement à chaque appel grâce à
 * `AsyncLocalStorage`. Ce contexte voyage avec la requête HTTP / le message
 * RabbitMQ / la session USSD sans qu'on ait à le passer en paramètre.
 *
 * POURQUOI : la corrélation des logs entre services est INDISPENSABLE pour
 * tracer un parcours citoyen (ex. soumission de correction → ai-service →
 * audit-service → notification-service). Sans X-Request-Id propagé, un
 * incident en prod est quasi impossible à reconstituer.
 */
export interface LogContext {
  /** UUID v7 (lexico-trié temporellement) — généré par api-gateway si absent. */
  correlationId: string;

  /** Identifiant de l'utilisateur authentifié (depuis JWT) — masqué côté logs. */
  userId?: string;

  /** Rôle de l'utilisateur — utile pour les audits SIGAC. */
  userRole?: string;

  /** Nom du service appelant — rempli automatiquement par `createLogger`. */
  service: string;

  /**
   * Identifiant de session USSD ou WebSocket si applicable — masqué dans
   * les logs de production (peut contenir un numéro de téléphone).
   */
  sessionId?: string;

  /**
   * Métadonnées ad-hoc spécifiques au service appelant (opération en cours,
   * identifiant d'agent, numéro masqué…). Volontairement non typé pour
   * éviter de polluer le contexte canonique partagé.
   *
   * Apparaît dans les logs sous la clé `extra` — queryable en LogQL via
   * `extra.<field>`. Ne PAS y placer de PII non masquée.
   */
  extra?: Record<string, unknown>;
}

/**
 * Options de configuration du logger à l'initialisation du service.
 */
export interface CreateLoggerOptions {
  /** Nom du service (ex. `"api-gateway"`). Apparaît dans chaque ligne de log. */
  service: string;

  /** Niveau minimum — par défaut `info` en prod, `debug` en dev. */
  level?: LogLevel;

  /** Environnement (`development` | `staging` | `production` | `test`). */
  environment?: string;

  /**
   * Si vrai, active le rendu coloré pino-pretty (DEV uniquement).
   * En PROD, le format est JSON pour Loki/Promtail.
   */
  pretty?: boolean;

  /**
   * Endpoint Loki — si défini, le logger pousse vers Loki en plus de stdout.
   * Format attendu : `http://loki:3100`. À résoudre depuis Vault en prod.
   */
  lokiUrl?: string;

  /** Version Git du service (hash court) — utile pour corréler avec un build. */
  gitSha?: string;

  /** Champs supplémentaires à inclure dans chaque ligne (organisation, datacenter). */
  baseFields?: Record<string, unknown>;
}

/**
 * Logger structuré exposé par `createLogger`. C'est une extension du logger
 * Pino natif avec des helpers métier (PII masking, correlation auto).
 */
export type StructuredLogger = PinoLogger & {
  /**
   * Retourne un logger enfant lié au contexte fourni. Les champs sont
   * automatiquement masqués selon les règles PII si nécessaire.
   *
   * @example
   * const log = logger.withContext({ operation: 'getCitizenByNina' });
   * log.info({ ninaMasked: maskNina(nina) }, 'Recherche');
   */
  withContext(ctx: Partial<LogContext>): StructuredLogger;
};

/** Réexport pour confort des consommateurs. */
export type { PinoLoggerOptions };
