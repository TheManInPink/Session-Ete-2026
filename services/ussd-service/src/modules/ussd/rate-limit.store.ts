/**
 * @file        rate-limit.store.ts
 * @description Rate-limiting USSD à DOUBLE dimension : par numéro appelant ET
 *              par NINA ciblé (doc 14 §4.2.2 — P0 anti-énumération).
 *
 *              POURQUOI deux dimensions : un `sessionId` est trivialement
 *              renouvelable (l'attaquant en génère un par requête) ; limiter le
 *              `sessionId` ne protège donc PAS de l'énumération. On limite sur :
 *                - `phoneNumber` : empêche un même numéro de balayer des
 *                  centaines de NINA (campagne d'énumération) ;
 *                - `NINA` ciblé : empêche que des numéros différents (botnet /
 *                  SIM box) ne convergent tous sur le MÊME NINA
 *                  (désanonymisation ciblée d'une personne).
 *
 *              CONFIDENTIALITÉ DES CLÉS : on indexe par un HASH (SHA-256 tronqué)
 *              du numéro / du NINA — JAMAIS la valeur en clair — pour ne pas
 *              créer de clés révélant des identités (OWASP A04:2021 — Insecure
 *              Design).
 *
 *              ⏳ ÉTAT (MVP) : compteurs EN MÉMOIRE (`Map` + TTL applicatif).
 *              CIBLE : Redis (`INCR` + `EXPIRE`) pour fonctionner en multi-pod
 *              et survivre au restart. Le contrôle de sécurité (double dimension,
 *              clés hachées, fenêtre glissante) est IDENTIQUE ; seul le backend
 *              de stockage change.
 *
 * @module      ussd-service/ussd
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

/** Compteur d'une fenêtre glissante : nombre de hits + instant d'expiration. */
interface Counter {
  count: number;
  expiresAt: number;
}

@Injectable()
export class RateLimitStore {
  /** Fenêtre glissante (millisecondes). */
  private static readonly WINDOW_MS = 60_000;
  /** Quota par numéro appelant : 10 interactions / min / numéro. */
  private static readonly MAX_PER_PHONE = 10;
  /** Quota par NINA ciblé : 5 consultations / min / NINA. */
  private static readonly MAX_PER_NINA = 5;
  /**
   * Quota d'ENVOI OTP : 1 SMS / fenêtre, par NINA ET par numéro officiel
   * destinataire (anti-amplification SMS / harcèlement, doc 14 §4.5). Ce quota
   * est INDÉPENDANT du compteur de consultation (`MAX_PER_NINA`) : même si le
   * lookup est encore sous quota, on ne déclenche PAS un nouveau SMS à chaque
   * `phone_mismatch`. Borne stricte le coût Africa's Talking et le spam infligé
   * au numéro de la victime avant toute preuve de possession.
   */
  private static readonly MAX_OTP_SENDS = 1;

  /**
   * ⏳ Stockage MVP en mémoire. À remplacer par Redis :
   *   `INCR ussd:rl:<dim>:<hash>` + `EXPIRE 60` au premier hit.
   */
  private readonly counters = new Map<string, Counter>();

  /**
   * Incrémente le compteur du numéro appelant et indique s'il faut REJETER.
   *
   * @param phone - Numéro E.164 appelant (jamais stocké en clair).
   * @returns `true` si le quota est dépassé (requête à rejeter).
   */
  isBlockedByPhone(phone: string): boolean {
    return this.bump(`phone:${this.hash(phone)}`, RateLimitStore.MAX_PER_PHONE);
  }

  /**
   * Incrémente le compteur du NINA ciblé et indique s'il faut REJETER.
   * Anti-désanonymisation d'une personne précise (plusieurs numéros → 1 NINA).
   *
   * @param nina - NINA ciblé (jamais stocké en clair).
   * @returns `true` si le quota est dépassé (requête à rejeter).
   */
  isBlockedByNina(nina: string): boolean {
    return this.bump(`nina:${this.hash(nina)}`, RateLimitStore.MAX_PER_NINA);
  }

  /**
   * Décide si un ENVOI OTP est autorisé pour ce couple (NINA, numéro officiel),
   * et le comptabilise. Anti-amplification SMS : on n'expédie qu'UN seul SMS par
   * fenêtre, qu'importe le nombre de probes (chaque `phone_mismatch` n'engendre
   * donc PAS un nouvel SMS). On compte sur DEUX dimensions indépendantes pour
   * couvrir le botnet (N numéros appelants → 1 NINA) ET le numéro destinataire
   * (N NINA appartenant à la même victime) :
   *   - `otp:nina:<hash(nina)>`   : borne par NINA ciblé ;
   *   - `otp:dst:<hash(phone)>`   : borne par numéro OFFICIEL destinataire.
   * Si l'UNE des deux dimensions est déjà saturée, on REFUSE l'envoi.
   *
   * @param nina - NINA ciblé (jamais stocké en clair).
   * @param officialPhone - Numéro officiel destinataire du SMS (jamais en clair).
   * @returns `true` si l'envoi OTP est autorisé (et désormais comptabilisé).
   */
  allowOtpSend(nina: string, officialPhone: string): boolean {
    // ATTENTION à l'ordre : `bump` a un EFFET DE BORD (incrément). On évalue les
    // deux dimensions sans court-circuit pour qu'un refus sur l'une consomme
    // aussi l'autre fenêtre — un attaquant ne peut pas « sonder » une dimension
    // sans épuiser l'autre.
    const ninaBlocked = this.bump(`otp:nina:${this.hash(nina)}`, RateLimitStore.MAX_OTP_SENDS);
    const dstBlocked = this.bump(
      `otp:dst:${this.hash(officialPhone)}`,
      RateLimitStore.MAX_OTP_SENDS,
    );
    return !ninaBlocked && !dstBlocked;
  }

  /**
   * Incrément atomique (mono-thread Node) + pose du TTL au premier hit de la
   * fenêtre. Purge paresseuse de la clé expirée avant comptage.
   *
   * @returns `true` si le compteur dépasse `max` après incrément.
   */
  private bump(key: string, max: number): boolean {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + RateLimitStore.WINDOW_MS });
      return 1 > max;
    }
    existing.count += 1;
    return existing.count > max;
  }

  /** SHA-256 tronqué — anti-corrélation des clés avec des identités réelles. */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }
}
