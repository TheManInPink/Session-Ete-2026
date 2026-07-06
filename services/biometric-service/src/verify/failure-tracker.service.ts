/**
 * @file        failure-tracker.service.ts
 * @description Compteur d'échecs de vérification anti-BRUTEFORCE (DPIA §6.5, doc
 *              25 §4.2). Une cible FAR ~1e-4 est BRUTE-FORÇABLE par volume de
 *              probes (≈ 1 acceptation pour 10 000 essais) : sans rate-limit, le
 *              seuil τ est contournable. On compte les échecs par `(agent,
 *              citizen)`, on VERROUILLE après N échecs dans une fenêtre, et on
 *              signale (l'appelant émet une alerte SIEM via l'audit).
 *
 *              ⚠️  STORE PARTAGÉ OBLIGATOIRE EN PRODUCTION. Sous la topologie
 *              multi-réplicas ciblée (K3s, doc 25 §2), un compteur EN MÉMOIRE par
 *              réplica laisse passer `N × réplicas` essais par fenêtre (chaque
 *              réplica n'observe que 1/N du trafic) ⇒ l'attaquant ÉTALE ses probes
 *              et le verrouillage — SEUL contrôle qui rend τ non contournable par
 *              volume — devient inefficace, l'alerte SIEM tardive/absente. On
 *              EXIGE donc un store PARTAGÉ (Redis) dès que `NODE_ENV=production`
 *              (fail-fast au boot sinon). L'impl MÉMOIRE reste UNIQUEMENT pour
 *              dev/test mono-instance.
 *
 *              ⚠️  FAIL-CLOSED côté Redis : si le store partagé est indisponible,
 *              on REFUSE (verrou actif) plutôt que d'ouvrir une fenêtre de
 *              bruteforce non comptée — `isLocked`/`recordFailure` se résolvent
 *              comme « verrouillé ». Le contrat `isLocked`/`recordFailure`/`reset`
 *              est inchangé hormis qu'il est désormais ASYNC.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/verify
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { FailureStoreUnavailableError, RedisFailureStore } from './failure-store.redis.js';

/** État d'échecs d'une clé `(agent, citizen)` — impl MÉMOIRE (dev/test). */
interface FailureState {
  count: number;
  /** Fin de la fenêtre de comptage / du verrouillage (epoch ms). */
  windowEndsAt: number;
}

@Injectable()
export class FailureTrackerService {
  private readonly logger = new Logger(FailureTrackerService.name);
  private readonly maxFailures: number;
  private readonly windowMs: number;
  /** `true` si on s'appuie sur le store PARTAGÉ (Redis) — obligatoire en prod. */
  private readonly useShared: boolean;
  /** Impl MÉMOIRE (dev/test mono-instance UNIQUEMENT). */
  private readonly states = new Map<string, FailureState>();

  constructor(
    cfg: ConfigService<Env, true>,
    private readonly shared: RedisFailureStore,
  ) {
    this.maxFailures = cfg.get('BIOMETRIC_VERIFY_MAX_FAILURES', { infer: true });
    this.windowMs = cfg.get('BIOMETRIC_VERIFY_LOCKOUT_SEC', { infer: true }) * 1000;
    this.useShared = cfg.get('BIOMETRIC_FAILURE_STORE_REDIS', { infer: true });

    // Garde-fou (en plus du fail-fast Zod) : jamais de compteur MÉMOIRE en prod.
    const isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
    if (isProd && !this.useShared) {
      throw new Error(
        '[biometric-service] anti-bruteforce : store partagé (Redis) OBLIGATOIRE en ' +
          'production (BIOMETRIC_FAILURE_STORE_REDIS=true) — sinon contournable par réplica (DPIA §6.5).',
      );
    }
  }

  /** Clé de comptage `(agent, citizen)` — un agent abusif est isolé par citoyen. */
  private key(agentId: string, citizenId: string): string {
    return `failkey:${agentId}::${citizenId}`;
  }

  /**
   * Indique si la paire `(agent, citizen)` est actuellement VERROUILLÉE (trop
   * d'échecs récents). En mode partagé indisponible → FAIL-CLOSED (verrouillé).
   *
   * @param agentId   Agent authentifié.
   * @param citizenId Citoyen ciblé.
   */
  async isLocked(agentId: string, citizenId: string): Promise<boolean> {
    if (this.useShared) {
      try {
        return (await this.shared.count(this.key(agentId, citizenId))) >= this.maxFailures;
      } catch (err) {
        if (err instanceof FailureStoreUnavailableError) {
          this.logger.warn('Store anti-bruteforce indisponible → verrouillage (fail-closed).');
          return true;
        }
        throw err;
      }
    }
    return this.isLockedInMemory(agentId, citizenId);
  }

  /**
   * Enregistre un échec et renvoie `true` si le verrou vient d'être atteint (à
   * tracer en alerte SIEM par l'appelant). En mode partagé indisponible →
   * FAIL-CLOSED (on considère le verrou atteint).
   *
   * @param agentId   Agent authentifié.
   * @param citizenId Citoyen ciblé.
   * @returns `true` si le seuil de verrouillage est désormais atteint.
   */
  async recordFailure(agentId: string, citizenId: string): Promise<boolean> {
    if (this.useShared) {
      try {
        const count = await this.shared.increment(
          this.key(agentId, citizenId),
          this.windowMs / 1000,
        );
        return count >= this.maxFailures;
      } catch (err) {
        if (err instanceof FailureStoreUnavailableError) {
          this.logger.warn(
            'Store anti-bruteforce indisponible → verrou réputé atteint (fail-closed).',
          );
          return true;
        }
        throw err;
      }
    }
    return this.recordFailureInMemory(agentId, citizenId);
  }

  /** Remet à zéro le compteur après un succès (l'agent légitime n'est pas pénalisé). */
  async reset(agentId: string, citizenId: string): Promise<void> {
    if (this.useShared) {
      await this.shared.clear(this.key(agentId, citizenId));
      return;
    }
    this.states.delete(this.key(agentId, citizenId));
  }

  // ── Impl MÉMOIRE (dev/test mono-instance UNIQUEMENT) ────────────────────

  /** Verrou en mémoire (fenêtre expirée nettoyée à la volée). */
  private isLockedInMemory(agentId: string, citizenId: string): boolean {
    const k = this.key(agentId, citizenId);
    const st = this.states.get(k);
    if (!st) return false;
    if (Date.now() >= st.windowEndsAt) {
      this.states.delete(k);
      return false;
    }
    return st.count >= this.maxFailures;
  }

  /** Comptage d'échec en mémoire (renvoie `true` au franchissement du seuil). */
  private recordFailureInMemory(agentId: string, citizenId: string): boolean {
    const k = this.key(agentId, citizenId);
    const now = Date.now();
    const st = this.states.get(k);
    if (!st || now >= st.windowEndsAt) {
      this.states.set(k, { count: 1, windowEndsAt: now + this.windowMs });
      return this.maxFailures <= 1;
    }
    st.count += 1;
    return st.count === this.maxFailures;
  }
}
