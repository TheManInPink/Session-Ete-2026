/**
 * @file        all-exceptions.filter.ts
 * @description Filtre global capturant TOUTES les exceptions et structurant
 *              la réponse au format ApiResponse<never> (cf. @nina-aes/shared-types).
 *
 *              Mappage des erreurs :
 *                - HttpException Nest  → status + message d'origine
 *                - ZodError            → 400 + détails par champ
 *                - PrismaClientKnownRequestError P2002 (unique) → 409
 *                - PrismaClientKnownRequestError P2025 (notFound) → 404
 *                - Autres              → 500 + log de l'erreur complète
 *
 * @module      identity-service/common
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, code, message, details } = this.normalizeError(exception);

    // Logger uniquement les 5xx en error, le reste en warn (404, 400, etc.)
    const logLevel = status >= 500 ? 'error' : 'warn';
    this.logger[logLevel](
      `${request.method} ${request.url} → ${status} ${code} — ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ErrorPayload = {
      success: false,
      error: {
        code,
        message,
        details,
        requestId: (request.headers['x-request-id'] as string) ?? undefined,
      },
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  /** Mappe une exception inconnue vers un format normalisé. */
  private normalizeError(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    // HttpException Nest (BadRequest, NotFound, Conflict, etc.)
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const status = exception.getStatus();
      if (typeof res === 'string') {
        return { status, code: this.statusToCode(status), message: res };
      }
      const raw = res as Record<string, unknown>;
      return {
        status,
        code: (raw.error as string) ?? this.statusToCode(status),
        message: Array.isArray(raw.message)
          ? (raw.message as string[]).join('; ')
          : ((raw.message as string) ?? exception.message),
        details: raw.details ?? raw.message,
      };
    }

    // Prisma errors (importé dynamiquement pour éviter dépendance dure)
    const err = exception as { code?: string; meta?: unknown; message?: string };
    if (err?.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT_UNIQUE',
        message: 'Une ressource avec cette valeur unique existe déjà',
        details: err.meta,
      };
    }
    if (err?.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'Ressource introuvable',
        details: err.meta,
      };
    }

    // ZodError (validation Zod côté service)
    const maybeZod = exception as { name?: string; issues?: unknown };
    if (maybeZod?.name === 'ZodError') {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Payload invalide',
        details: maybeZod.issues,
      };
    }

    // Fallback : erreur 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: err?.message ?? 'Erreur interne inattendue',
    };
  }

  private statusToCode(status: number): string {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'UNPROCESSABLE_ENTITY',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_SERVER_ERROR',
        502: 'BAD_GATEWAY',
        503: 'SERVICE_UNAVAILABLE',
      }[status] ?? `HTTP_${status}`
    );
  }
}
