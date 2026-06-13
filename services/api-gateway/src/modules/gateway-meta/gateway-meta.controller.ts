/**
 * @file        gateway-meta.controller.ts
 * @description Endpoints d'introspection du gateway lui-même, montés sous
 *              `/api/v1/api-gateway` (la 15e « cible » du tableau de routage,
 *              servie localement et NON proxifiée).
 *
 *              - GET /api/v1/api-gateway/info        (public) — version, uptime
 *              - GET /api/v1/api-gateway/openapi.json (public) — spec agrégée
 *              - GET /api/v1/api-gateway/routes      (protégé) — table de routage
 *              - GET /api/v1/api-gateway/breakers    (protégé) — état des circuits
 *
 *              La publicité/protection de chaque route est décidée par
 *              {@link GatewayAuthGuard} (allowlist `LOCAL_PUBLIC_PREFIXES`).
 *
 *              ⚠️  Ce controller DOIT être enregistré AVANT le ProxyController
 *              (catch-all `/api/v1/*`) — garanti par l'ordre d'`imports` dans
 *              AppModule (ProxyModule en dernier).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/gateway-meta
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  BreakerRegistry,
  type BreakerSnapshot,
} from '../../infrastructure/breaker/breaker.registry.js';
import { AggregatorService } from '../aggregator/aggregator.service.js';
import { OpenApiBaseHolder } from '../aggregator/openapi-base.holder.js';
import { listRoutesPublic, type PublicRouteInfo } from '../proxy/proxy.routes.js';

/** Réponse de `/info`. */
interface GatewayInfo {
  service: 'api-gateway';
  version: string;
  env: string;
  uptimeSeconds: number;
}

@ApiTags('api-gateway')
@Controller('api-gateway')
export class GatewayMetaController {
  constructor(
    private readonly breakers: BreakerRegistry,
    private readonly aggregator: AggregatorService,
    private readonly baseHolder: OpenApiBaseHolder,
  ) {}

  /** Métadonnées non sensibles (public). */
  @Get('info')
  @ApiOperation({ summary: 'Métadonnées du gateway (version, uptime)' })
  info(): GatewayInfo {
    return {
      service: 'api-gateway',
      version: process.env.SERVICE_VERSION ?? '1.0.0',
      env: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  /** Spec OpenAPI agrégée de toute la plateforme (public, machine-readable). */
  @Get('openapi.json')
  @ApiOperation({ summary: 'Spec OpenAPI agrégée des 14 services aval + gateway' })
  @ApiOkResponse({ description: 'Document OpenAPI 3.1 fusionné' })
  async openapi(): Promise<OpenAPIObject> {
    return this.aggregator.getAggregated(this.baseHolder.get());
  }

  /** Table de routage publique (protégé — révèle la topologie). */
  @Get('routes')
  @ApiOperation({ summary: 'Table de routage publique du gateway' })
  routes(): { total: number; routes: PublicRouteInfo[] } {
    const routes = listRoutesPublic();
    return { total: routes.length, routes };
  }

  /** État courant des circuit breakers (protégé). */
  @Get('breakers')
  @ApiOperation({ summary: 'État des circuit breakers Opossum par service aval' })
  breakerStates(): { total: number; breakers: BreakerSnapshot[] } {
    const snapshots = this.breakers.snapshotAll();
    return { total: snapshots.length, breakers: snapshots };
  }
}
