/**
 * @file        rate-limiter.ts
 * @description Limiteur de débit (espacement de jetons) appliqué au chemin
 *              CONSUMER (événements + broadcast) pour protéger les fournisseurs
 *              (Africa's Talking, SMTP). Le chemin HTTP /send (transactionnel,
 *              ex. code MFA) n'y est PAS soumis — il doit rester immédiat.
 *
 *              Implémentation « prochain créneau » : chaque `acquire()` réserve
 *              un créneau espacé de `1000/débit` ms du précédent. La réservation
 *              (lecture+écriture de `nextSlot`) est synchrone donc atomique en
 *              JS — l'espacement reste correct même avec N workers concurrents.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/consumer
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class RateLimiter {
  /** Intervalle minimal entre deux envois (ms). 0 ⇒ pas de limite. */
  private readonly intervalMs: number;
  /** Horodatage du prochain créneau disponible. */
  private nextSlot = 0;

  constructor(cfg: ConfigService<Env, true>) {
    const rate = cfg.get('NOTIFICATION_BROADCAST_RATE_PER_SEC', { infer: true });
    this.intervalMs = rate > 0 ? 1000 / rate : 0;
  }

  /** Attend (si nécessaire) le prochain créneau d'envoi autorisé. */
  async acquire(): Promise<void> {
    if (this.intervalMs <= 0) return;
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + this.intervalMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
