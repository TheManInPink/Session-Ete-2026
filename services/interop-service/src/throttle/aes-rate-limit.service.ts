/**
 * @file        aes-rate-limit.service.ts
 * @description Rate-limit contractuel BCID-AES (doc 21 §4.4) : 1000 req/h/pays
 *              (configurable), fenêtre glissante via Redis sorted set.
 *
 *              ✅ Le pays vient du cert mTLS RÉEL (résolu en amont), PAS d'un
 *              header client : un partenaire ne peut pas usurper un autre pays
 *              pour brûler son quota ou contourner le sien (A01).
 *
 *              🔒 FAIL-CLOSED : si Redis est indisponible, on REFUSE (503) plutôt
 *              que de laisser pulvériser la limite pendant la panne. Un fail-open
 *              serait silencieux et exploitable.
 *
 *              Implémenté en SERVICE (et non en `CanActivate` global) car le pays
 *              n'est connu qu'APRÈS la dérivation du cert mTLS + la vérification
 *              JWS — l'ordre canonique étant :
 *                cert mTLS → assertPeerKnown → verifyJws → anti-replay →
 *                RATE-LIMIT → métier.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/throttle
 */
import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';

@Injectable()
export class AesRateLimitService {
  private readonly limit: number;
  private readonly windowSec: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {
    this.limit = cfg.get('INTEROP_RATE_LIMIT_PER_COUNTRY', { infer: true });
    this.windowSec = cfg.get('INTEROP_RATE_LIMIT_WINDOW_SEC', { infer: true });
  }

  /**
   * Comptabilise une requête entrante d'un pays et applique le quota glissant.
   *
   * @param country Pays demandeur (issu du cert mTLS réel).
   * @throws HttpException 429 si le quota est dépassé.
   * @throws ServiceUnavailableException 503 si Redis est indisponible (fail-closed).
   */
  async enforce(country: string): Promise<void> {
    const now = Date.now();
    const member = `${now}:${randomUUID()}`; // membre unique interne, jamais un header.

    let count: number;
    try {
      count = await this.redis.slidingWindowCount(
        `ratelimit:${country}`,
        member,
        now,
        this.windowSec * 1000,
        this.windowSec,
      );
    } catch {
      // FAIL-CLOSED : refuser (503) plutôt que laisser passer pendant la panne.
      throw new ServiceUnavailableException('Store de rate-limit indisponible — requête refusée');
    }

    if (count > this.limit) {
      throw new HttpException(
        `Quota BCID-AES dépassé pour ${country} (max ${this.limit}/${this.windowSec}s)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
