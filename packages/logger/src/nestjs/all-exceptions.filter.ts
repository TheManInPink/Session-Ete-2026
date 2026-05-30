/**
 * @file        all-exceptions.filter.ts
 * @description Filtre d'exceptions GLOBAL pour tous les services NestJS NINA-AES.
 *
 *              POURQUOI : sans ce filtre, une exception non capturée renvoie
 *              soit un message générique "Internal server error", soit le
 *              stack trace en clair (en mode debug) — les deux sont MAUVAIS.
 *              Le premier est inexploitable côté frontend (pas de code
 *              i18n-able), le second expose des secrets potentiels.
 *
 *              CE FILTRE :
 *              1. Capture TOUTE exception (HttpException, ZodError, Prisma
 *                 errors, RxJS errors, erreurs natives, etc.)
 *              2. Mappe chaque cas vers un code d'erreur normalisé Annexe C.
 *              3. Logue avec niveau approprié (4xx = warn, 5xx = error).
 *              4. Renvoie une `ErrorResponse` unifiée que le frontend sait
 *                 transformer en message utilisateur localisé.
 *
 *              FORMAT DE SORTIE — toujours respecté :
 *              ```json
 *              {
 *                "ok": false,
 *                "error": {
 *                  "code": "E_NINA_FORMAT_001",
 *                  "message": "Format NINA invalide",
 *                  "correlationId": "01938...",
 *                  "timestamp": "2026-05-23T14:32:11.012Z",
 *                  "details": { ... }   // dev/staging uniquement
 *                }
 *              }
 *              ```
 *
 * @module      @nina-aes/logger/nestjs/all-exceptions.filter
 */

import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { getContext } from '../correlation.js';
import { getFallbackLogger } from '../logger.js';
import type { StructuredLogger } from '../types.js';

/**
 * Forme stricte de la réponse d'erreur HTTP renvoyée par TOUS les services.
 * Importé par `@nina-aes/shared-types` pour réutilisation côté frontend.
 */
export interface ErrorResponse {
  ok: false;
  error: {
    /** Code normalisé Annexe C — ex. "E_NINA_FORMAT_001" */
    code: string;
    /** Message lisible (peut être déjà localisé ou clé i18n) */
    message: string;
    /** UUID v7 de la requête — à citer dans un ticket support */
    correlationId: string;
    /** ISO 8601 UTC */
    timestamp: string;
    /** Détails techniques (uniquement dev/staging) */
    details?: unknown;
  };
}

/**
 * Mappe une exception arbitraire vers `{ status, code, message }`.
 *
 * POURQUOI une fonction et pas un switch dans le filtre : permet de tester
 * unitairement la classification sans bootstrapper NestJS.
 */
/**
 * Détecte une `HttpException` de façon robuste. `instanceof` PEUT échouer si le
 * service consommateur charge une COPIE distincte de `@nestjs/common` (résolution
 * pnpm/peer-deps ou frontière ESM↔CJS) → on duck-type aussi sur getStatus()/
 * getResponse(). Sans ça, un 404 légitime tomberait dans le cas 500 par défaut.
 */
function isHttpExceptionLike(exc: unknown): exc is HttpException {
  return (
    exc instanceof HttpException ||
    (typeof exc === 'object' &&
      exc !== null &&
      typeof (exc as HttpException).getStatus === 'function' &&
      typeof (exc as HttpException).getResponse === 'function')
  );
}

function classifyError(exc: unknown): {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  // Cas 1 : HttpException explicite — on respecte le status et tente d'extraire un code
  if (isHttpExceptionLike(exc)) {
    const status = exc.getStatus();
    const response = exc.getResponse();

    // Le format `{ code, message }` est notre convention interne
    if (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      'message' in response
    ) {
      const r = response as { code: string; message: string; details?: unknown };
      return { status, code: r.code, message: r.message, details: r.details };
    }
    // Cas par défaut : on dérive un code générique du status HTTP
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string }).message ?? exc.message);
    return { status, code: deriveCodeFromStatus(status), message };
  }

  // Cas 2 : ZodError (par duck-typing pour ne pas dépendre du package zod ici)
  if (
    typeof exc === 'object' &&
    exc !== null &&
    (exc as { name?: string }).name === 'ZodError' &&
    'issues' in exc
  ) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'E_VALIDATION_001',
      message: 'Validation des données échouée',
      details: (exc as { issues: unknown }).issues,
    };
  }

  // Cas 3 : erreur Prisma (par duck-typing — ne pas tirer @prisma/client ici)
  if (
    typeof exc === 'object' &&
    exc !== null &&
    'code' in exc &&
    typeof (exc as { code: unknown }).code === 'string' &&
    (exc as { code: string }).code.startsWith('P')
  ) {
    const prismaCode = (exc as { code: string }).code;
    // P2002 = contrainte unique, P2025 = enregistrement absent, etc.
    if (prismaCode === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'E_DB_NOT_FOUND_001',
        message: 'Ressource introuvable',
      };
    }
    if (prismaCode === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        code: 'E_DB_CONFLICT_001',
        message: 'Conflit de contrainte unique',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'E_DB_001',
      message: 'Erreur base de données',
      details: { prismaCode },
    };
  }

  // Cas par défaut : erreur inconnue → 500 générique
  const message = exc instanceof Error ? exc.message : 'Erreur interne';
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'E_INTERNAL_001',
    message,
  };
}

/**
 * Dérive un code générique depuis un status HTTP, faute de mieux.
 * Sert UNIQUEMENT de filet de sécurité — chaque service devrait définir
 * ses propres codes Annexe C et les renvoyer explicitement.
 */
function deriveCodeFromStatus(status: number): string {
  if (status === 400) return 'E_BAD_REQUEST_001';
  if (status === 401) return 'E_UNAUTHORIZED_001';
  if (status === 403) return 'E_FORBIDDEN_001';
  if (status === 404) return 'E_NOT_FOUND_001';
  if (status === 409) return 'E_CONFLICT_001';
  if (status === 422) return 'E_VALIDATION_001';
  if (status === 429) return 'E_RATE_LIMIT_001';
  if (status >= 500) return 'E_INTERNAL_001';
  return 'E_UNKNOWN_001';
}

/**
 * Filtre NestJS global — capture tout (`@Catch()` sans argument).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /**
   * @param logger - Logger structuré injecté par `LoggerModule.forRoot()`.
   *                 Si absent (cas exceptionnel), fallback au logger global.
   * @param environment - Environnement runtime — gouverne l'inclusion des
   *                      `details` techniques dans la réponse HTTP.
   */
  constructor(
    private readonly logger: StructuredLogger = getFallbackLogger(),
    private readonly environment: string = process.env.NODE_ENV ?? 'development',
  ) {}

  catch(exc: unknown, host: ArgumentsHost): void {
    const httpCtx = host.switchToHttp();
    const res = httpCtx.getResponse<Response>();

    const { status, code, message, details } = classifyError(exc);
    const correlationId = getContext()?.correlationId ?? 'no-correlation';
    const timestamp = new Date().toISOString();

    // Construction de la réponse — détails seulement hors prod
    const errorBody: ErrorResponse = {
      ok: false,
      error: {
        code,
        message,
        correlationId,
        timestamp,
        ...(this.environment !== 'production' && details !== undefined ? { details } : {}),
      },
    };

    // Logging proportionnel à la gravité.
    // POURQUOI : un 404 légitime ne doit pas pourrir le dashboard d'erreurs.
    const logFields = {
      err: exc instanceof Error ? exc : new Error(String(exc)),
      httpStatus: status,
      errorCode: code,
      path: httpCtx.getRequest<{ url?: string }>().url,
    };

    if (status >= 500) {
      this.logger.error(logFields, message);
    } else if (status >= 400) {
      // 4xx = warn (mauvais usage côté client, pas un bug serveur)
      this.logger.warn(logFields, message);
    } else {
      this.logger.info(logFields, message);
    }

    res.status(status).json(errorBody);
  }
}
