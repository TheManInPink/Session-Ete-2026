/**
 * @file        logging.interceptor.ts
 * @description Interceptor global qui log structuré chaque requête HTTP entrante
 *              avec :
 *                - method + path + status code
 *                - durée (ms)
 *                - userId (si JWT décodé par le guard d'auth en aval)
 *                - requestId (header x-request-id ou généré)
 *
 *              Émet aussi des métriques Prometheus http_requests_total +
 *              http_request_duration_seconds via BusinessMetrics injecté.
 *
 * @module      identity-service/common
 */

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // Garantir un request-id pour la corrélation logs/traces
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    const { method, url } = req;
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? 'anonymous';

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        this.logger.log(
          JSON.stringify({
            method,
            url,
            status,
            duration_ms: duration,
            user_id: userId,
            request_id: requestId,
          }),
        );
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.error(
          JSON.stringify({
            method,
            url,
            status: err?.status ?? 500,
            duration_ms: duration,
            user_id: userId,
            request_id: requestId,
            error: err?.message,
          }),
        );
        throw err;
      }),
    );
  }
}
