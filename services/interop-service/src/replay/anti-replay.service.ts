/**
 * @file        anti-replay.service.ts
 * @description Anti-replay BCID-AES (doc 21 §4.2bis) — exécuté AVANT toute
 *              logique métier (mais APRÈS la vérification JWS, car on a besoin du
 *              `jti` signé).
 *
 *              Deux barrières cumulatives, indépendantes du `@unique` DB (qui ne
 *              se déclenche qu'à l'INSERT, trop tard) :
 *                (a) FENÊTRE TIMESTAMP : |now - payload.timestamp| ≤ ±2 min →
 *                    rejette les vieux replays (400).
 *                (b) UNICITÉ jti       : Redis `SET key NX PX` (atomique) →
 *                    rejette les replays « frais » (403).
 *
 *              🔒 FAIL-CLOSED : si Redis est injoignable, on REFUSE (503). Accepter
 *              « au cas où » ouvrirait une fenêtre de replay non maîtrisée.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/replay
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';

@Injectable()
export class AntiReplayService {
  private readonly windowMs: number;

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {
    // Même tolérance que le clockTolerance JWS (±2 min) — cohérence des fenêtres.
    this.windowMs = cfg.get('INTEROP_CLOCK_TOLERANCE_SEC', { infer: true }) * 1000;
  }

  /**
   * Rejette un replay : fenêtre timestamp PUIS unicité du jti (Redis SET NX).
   *
   * @param jti       Identifiant unique signé du JWS (= requestId).
   * @param requestId requestId métier (journalisé comme valeur de garde).
   * @param timestamp Horodatage ISO du payload (fenêtre de fraîcheur).
   * @throws BadRequestException     si le timestamp est hors fenêtre (vieux replay).
   * @throws ForbiddenException      si le jti a déjà été vu (replay frais).
   * @throws ServiceUnavailableException si Redis est indisponible (fail-closed).
   */
  async assertNotReplayed(jti: string, requestId: string, timestamp: string): Promise<void> {
    // (a) Fenêtre temporelle : le payload signé doit être « frais ».
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > this.windowMs) {
      throw new BadRequestException('Horodatage hors fenêtre ±2 min (replay ?)');
    }

    // (b) Unicité du jti : SET NX atomique. TTL = fenêtre + 60 s de marge (au-delà,
    //     la barrière (a) prend le relais ⇒ inutile de garder le jti plus longtemps).
    let posed: boolean;
    try {
      posed = await this.redis.setReplayGuard(`replay:${jti}`, requestId, this.windowMs + 60_000);
    } catch {
      // Fail-CLOSED : si Redis tombe, on REFUSE plutôt que de risquer un replay accepté.
      throw new ServiceUnavailableException('Store anti-replay indisponible — requête refusée');
    }
    if (!posed) {
      throw new ForbiddenException('Replay détecté (jti déjà vu)');
    }
  }
}
