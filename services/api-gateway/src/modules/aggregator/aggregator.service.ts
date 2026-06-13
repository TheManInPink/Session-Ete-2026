/**
 * @file        aggregator.service.ts
 * @description Construit la spec OpenAPI AGRÉGÉE du gateway (responsabilité
 *              n°9 : « /api/docs — Swagger UI agrégé combinant les services »).
 *
 *              Récupère paresseusement `${base}/api/docs-json` de chaque service
 *              aval DISTINCT, fusionne le tout via {@link mergeOpenApiDocuments},
 *              et met le résultat en cache (TTL configurable).
 *
 *              DÉGRADATION DOUCE : un service injoignable est simplement ignoré
 *              (log warn) — la spec agrégée contient alors les services
 *              disponibles + la base native du gateway. On ne fait jamais
 *              échouer la requête `/openapi.json` à cause d'un downstream KO.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/aggregator
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OpenAPIObject } from '@nestjs/swagger';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';
import type { Env } from '../../config/env.schema.js';
import { distinctDownstreams } from '../proxy/proxy.routes.js';
import { mergeOpenApiDocuments, type DownstreamSpec } from './openapi-merge.js';

@Injectable()
export class AggregatorService {
  private readonly ttlMs: number;
  private readonly fetchTimeoutMs: number;
  private cache: { doc: OpenAPIObject; expiresAt: number } | null = null;

  constructor(
    cfg: ConfigService<Env, true>,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {
    this.ttlMs = cfg.get('SWAGGER_AGGREGATE_TTL_SEC', { infer: true }) * 1000;
    this.fetchTimeoutMs = cfg.get('SWAGGER_AGGREGATE_FETCH_TIMEOUT_MS', { infer: true });
  }

  /**
   * Renvoie la spec agrégée (cache TTL). `base` est la spec native du gateway,
   * injectée par l'appelant (qui seul possède l'instance Nest pour la générer).
   *
   * @param base Spec OpenAPI native du gateway.
   * @param force Ignore le cache si `true` (endpoint de refresh).
   * @returns La spec OpenAPI agrégée.
   */
  async getAggregated(base: OpenAPIObject, force = false): Promise<OpenAPIObject> {
    const now = Date.now();
    if (!force && this.cache && this.cache.expiresAt > now) {
      return this.cache.doc;
    }
    const parts = await this.fetchDownstreamSpecs();
    const doc = mergeOpenApiDocuments(base, parts);
    this.cache = { doc, expiresAt: now + this.ttlMs };
    this.logger.info(
      { services: parts.map((p) => p.serviceName), total: parts.length },
      'Spec OpenAPI agrégée (re)construite',
    );
    return doc;
  }

  /**
   * Récupère en parallèle la spec de chaque service aval distinct, en ignorant
   * les échecs (timeout, 404, réseau).
   */
  private async fetchDownstreamSpecs(): Promise<DownstreamSpec[]> {
    const targets = distinctDownstreams();
    const results = await Promise.allSettled(
      targets.map(async ({ serviceName, targetBaseUrl }): Promise<DownstreamSpec> => {
        const spec = await this.fetchOne(`${targetBaseUrl}/api/docs-json`);
        return { serviceName, spec };
      }),
    );

    const parts: DownstreamSpec[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        parts.push(r.value);
      } else {
        this.logger.warn(
          { service: targets[i]?.serviceName, err: String(r.reason) },
          "Spec OpenAPI aval injoignable — ignorée dans l'agrégat",
        );
      }
    });
    return parts;
  }

  /** Fetch d'une spec avec timeout dur (AbortController). */
  private async fetchOne(url: string): Promise<OpenAPIObject> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as OpenAPIObject;
    } finally {
      clearTimeout(timer);
    }
  }
}
