/**
 * @file        breaker.registry.ts
 * @description Registre GLOBAL des circuit breakers du gateway. Découple le
 *              {@link ProxyService} (qui crée et possède les breakers Opossum)
 *              du {@link GatewayMetaController} (qui les expose en lecture seule
 *              sur `/api/v1/api-gateway/breakers`).
 *
 *              POURQUOI un registre plutôt qu'une injection directe de
 *              ProxyService dans gateway-meta : importer ProxyModule depuis
 *              gateway-meta forcerait l'initialisation du controller catch-all
 *              AVANT gateway-meta et casserait l'ordre d'enregistrement des
 *              routes (le catch-all `/api/v1/*` capterait alors `/api/v1/api-gateway`).
 *              Un module global sans controller n'a aucun effet d'ordre.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/infrastructure/breaker
 */
import { Injectable } from '@nestjs/common';

/** Instantané lisible de l'état d'un circuit breaker. */
export interface BreakerSnapshot {
  service: string;
  state: 'closed' | 'open' | 'halfOpen';
  stats: {
    successes: number;
    failures: number;
    timeouts: number;
    rejects: number;
    fires: number;
  };
}

@Injectable()
export class BreakerRegistry {
  /** service → fonction renvoyant un instantané frais (lazy). */
  private readonly providers = new Map<string, () => BreakerSnapshot>();

  /** Enregistre (ou remplace) la source d'instantané d'un service. */
  register(service: string, snapshot: () => BreakerSnapshot): void {
    this.providers.set(service, snapshot);
  }

  /** Instantané de tous les breakers connus à l'instant T. */
  snapshotAll(): BreakerSnapshot[] {
    return [...this.providers.values()].map((fn) => fn());
  }
}
