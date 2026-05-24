/**
 * @file        logger.ts
 * @description Factory du logger Pino central NINA-AES.
 *
 *              POURQUOI un seul logger central :
 *              - cohérence du format (JSON en prod, pretty en dev)
 *              - cohérence des règles de masquage PII
 *              - cohérence du niveau de log par environnement
 *              - injection automatique du correlationId via mixin
 *              Sans cette centralisation, chaque service réinventerait sa
 *              propre config, et le drift commencerait dès le 2e service.
 *
 * @module      @nina-aes/logger/logger
 */

import pino, { type LoggerOptions } from 'pino';
import { getContext } from './correlation.js';
import { PII_REDACT_PATHS, REDACT_CENSOR } from './redaction.js';
import type { CreateLoggerOptions, LogLevel, StructuredLogger } from './types.js';

/**
 * Détermine le niveau de log par défaut selon l'environnement.
 *
 * - `test`        → `silent` (logs muets dans les tests pour ne pas polluer)
 * - `development` → `debug`  (verbosité élevée pendant le dev)
 * - `staging`     → `info`   (équilibre)
 * - `production`  → `info`   (info par défaut, élevable à warn si volumétrie excessive)
 */
function defaultLevelFor(env?: string): LogLevel {
  switch (env) {
    case 'test':
      return 'fatal'; // équivalent silencieux pour la plupart des tests
    case 'development':
      return 'debug';
    case 'staging':
    case 'production':
    default:
      return 'info';
  }
}

/**
 * Mixin Pino : injecté à CHAQUE log, ajoute correlationId / userId / sessionId
 * depuis AsyncLocalStorage.
 *
 * POURQUOI MIXIN : c'est l'API officielle Pino pour des champs dynamiques.
 * On évite ainsi de devoir appeler `.child({...})` à chaque opération.
 */
function correlationMixin(): Record<string, unknown> {
  const ctx = getContext();
  if (!ctx) return {};
  return {
    correlationId: ctx.correlationId,
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(ctx.userRole ? { userRole: ctx.userRole } : {}),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
}

/**
 * Crée le logger Pino central. À appeler UNE seule fois par service, au
 * bootstrap. Le retour doit être réutilisé partout (via DI NestJS ou import).
 *
 * @param options - Configuration du service appelant.
 * @returns Instance {@link StructuredLogger} avec helpers métier.
 *
 * @example
 *   // services/api-gateway/src/main.ts
 *   const logger = createLogger({
 *     service: 'api-gateway',
 *     environment: process.env.NODE_ENV,
 *     pretty: process.env.NODE_ENV === 'development',
 *     gitSha: process.env.GIT_SHA,
 *   });
 *   logger.info('Démarrage api-gateway sur port 3000');
 */
export function createLogger(options: CreateLoggerOptions): StructuredLogger {
  const env = options.environment ?? process.env.NODE_ENV ?? 'development';
  const level = options.level ?? defaultLevelFor(env);
  const usePretty = options.pretty ?? env === 'development';

  // Configuration Pino
  const pinoOptions: LoggerOptions = {
    level,
    // Identifiant fixe ajouté à chaque ligne
    base: {
      service: options.service,
      env,
      ...(options.gitSha ? { gitSha: options.gitSha } : {}),
      ...(options.baseFields ?? {}),
    },
    // Mixin dynamique : injecte le contexte à chaque log
    mixin: correlationMixin,
    // Sérialisation des erreurs (stack trace incluse)
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    // Masquage automatique des PII — voir redaction.ts
    redact: {
      paths: [...PII_REDACT_PATHS],
      censor: REDACT_CENSOR,
      remove: false, // on garde la clé, on remplace la valeur (debug-friendly)
    },
    // Timestamp ISO 8601 UTC — exigible pour Loki
    timestamp: pino.stdTimeFunctions.isoTime,
    // Identifiant de processus pour distinguer plusieurs instances du service
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  // Transport pino-pretty en dev pour lisibilité
  if (usePretty) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,env,service',
        messageFormat: '[{service}] {msg}',
      },
    };
  }

  const baseLogger = pino(pinoOptions);

  // Étend le logger avec notre helper `withContext`
  const enriched = baseLogger as StructuredLogger;
  enriched.withContext = function withContext(ctx) {
    // child() Pino reprend automatiquement le mixin → corrélation préservée
    return baseLogger.child(ctx) as StructuredLogger;
  };

  return enriched;
}

/**
 * Logger par défaut, créé paresseusement. Réservé aux cas d'urgence où on
 * n'a pas accès à l'instance configurée (ex. boot avant `createLogger`).
 *
 * AVERTISSEMENT : utiliser un logger non configuré ne fournit ni mixin
 * de corrélation ni champs `service`. À éviter dans tout code applicatif.
 */
let fallback: StructuredLogger | null = null;
export function getFallbackLogger(): StructuredLogger {
  if (!fallback) {
    fallback = createLogger({ service: 'unknown', level: 'info' });
  }
  return fallback;
}
