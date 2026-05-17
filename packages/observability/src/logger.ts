/**
 * @file        logger.ts
 * @description Factory Pino structuré avec :
 *                - Sortie pretty en dev (lisible humain)
 *                - Transport Loki HTTP en staging/prod
 *                - Redaction automatique des PII NINA-AES (15 champs)
 *
 *              Cf. ADR-017 §Note PII safe by construction +
 *              docs/17-MONITORING-OBSERVABILITY.md §4.1.
 *
 *              ⚠️ Le redact est ÉTANCHE — tout nouveau champ PII doit
 *              être ajouté à PII_REDACT_PATHS, sinon il sera émis en
 *              clair dans Loki. Test associé :
 *              packages/observability/src/__tests__/redact.test.ts
 */

import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

/** Chemins JSON à toujours caviardiser dans les logs. */
const PII_REDACT_PATHS = [
  // NINA brut (15 chars XYY...A)
  'nina',
  'ninaRaw',
  'ninaNumber',
  '*.nina',
  '*.ninaRaw',
  '*.ninaNumber',

  // Biométrie
  'fingerprintHash',
  'faceEmbedding',
  '*.fingerprintHash',
  '*.faceEmbedding',

  // Données personnelles
  'dateNaissance',
  'dateOfBirth',
  '*.dateNaissance',
  '*.dateOfBirth',
  'phoneNumber',
  '*.phoneNumber',

  // Secrets accidentels
  'password',
  'token',
  'refreshToken',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.refreshToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
] as const;

export interface PinoLoggerOptions {
  /** Nom du service (label Loki). */
  serviceName: string;
  /** Niveau de log (défaut LOG_LEVEL env ou 'info'). */
  level?: 'debug' | 'info' | 'warn' | 'error';
  /** URL Loki (défaut LOKI_URL env). */
  lokiUrl?: string;
  /**
   * Mode de transport :
   *   - 'pretty' (dev, défaut si ENV=dev)
   *   - 'loki' (staging/prod, défaut sinon)
   *   - 'both' (debug local avec Loki réel)
   */
  transport?: 'pretty' | 'loki' | 'both';
}

/** Crée un logger Pino préconfiguré pour NINA-AES. */
export function createPinoLogger(opts: PinoLoggerOptions): PinoLogger {
  const env = process.env.ENV ?? 'dev';
  const level = opts.level ?? (process.env.LOG_LEVEL as PinoLoggerOptions['level']) ?? 'info';
  const mode = opts.transport ?? (env === 'dev' ? 'pretty' : 'loki');

  const baseOptions: LoggerOptions = {
    level,
    base: {
      service: opts.serviceName,
      version: process.env.SERVICE_VERSION ?? '0.1.0',
      env,
    },
    redact: {
      paths: [...PII_REDACT_PATHS],
      censor: '***REDACTED***',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  const targets: pino.TransportTargetOptions[] = [];

  if (mode === 'pretty' || mode === 'both') {
    targets.push({
      target: 'pino-pretty',
      level: 'debug',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    });
  }

  if (mode === 'loki' || mode === 'both') {
    const lokiUrl = opts.lokiUrl ?? process.env.LOKI_URL ?? 'http://loki:3100';
    targets.push({
      target: 'pino-loki',
      level: 'info',
      options: {
        host: lokiUrl,
        labels: {
          service: opts.serviceName,
          env,
        },
        batching: true,
        interval: 5,
        timeout: 30_000,
      },
    });
  }

  if (targets.length === 0) {
    return pino(baseOptions);
  }
  return pino(baseOptions, pino.transport({ targets }));
}
