/**
 * @file        sms-otp.client.ts
 * @description 2ᵉ facteur SMS (OTP) du binding phone↔NINA (doc 14 §4.5).
 *
 *              RÔLE : quand le numéro appelant ≠ `Citizen.phoneNumber`, on ne
 *              dévoile PAS la fiche. À la place, on envoie un OTP au numéro
 *              OFFICIEL du citoyen. Un attaquant qui ne contrôle pas la ligne ne
 *              peut pas poursuivre — c'est la barrière anti-usurpation MSISDN
 *              (THREAT-MODEL §4.7-S).
 *
 *              COMPARAISON EN TEMPS CONSTANT : le code saisi est comparé au code
 *              attendu via `crypto.timingSafeEqual` (anti-timing-attack).
 *
 *              ⏳ ÉTAT (MVP) : l'OTP est stocké EN MÉMOIRE (clé = sessionId, TTL
 *              court) et « envoyé » via le journal (pas d'envoi SMS réel). CIBLE :
 *              stockage Redis + envoi via Africa's Talking SMS API. Le contrôle
 *              de sécurité (génération aléatoire, TTL, nombre d'essais borné,
 *              comparaison temps constant) est appliqué dès maintenant.
 *
 * @module      ussd-service/ussd/clients
 */

import { Injectable } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { maskNina, maskPhone } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

/** Défi OTP en attente, lié à une session USSD. */
interface PendingOtp {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
}

@Injectable()
export class SmsOtpClient {
  /** Durée de vie de l'OTP (ms) — alignée sur la fenêtre de session USSD. */
  private static readonly TTL_MS = 180_000;
  /** Nombre d'essais de saisie avant invalidation (anti-bruteforce). */
  private static readonly MAX_ATTEMPTS = 3;

  /** ⏳ Stockage MVP en mémoire (clé = sessionId). CIBLE : Redis. */
  private readonly pending = new Map<string, PendingOtp>();

  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  /**
   * Génère un OTP à 6 chiffres et l'« envoie » au numéro officiel du citoyen.
   *
   * @param sessionId - Session USSD à laquelle lier le défi.
   * @param officialPhone - Numéro OFFICIEL du citoyen (destinataire du SMS).
   * @param nina - NINA concerné (pour le log masqué uniquement).
   */
  challenge(sessionId: string, officialPhone: string, nina: string): void {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.pending.set(sessionId, {
      code,
      expiresAt: Date.now() + SmsOtpClient.TTL_MS,
      attemptsLeft: SmsOtpClient.MAX_ATTEMPTS,
    });

    // ⏳ MVP : pas d'envoi SMS réel. On NE LOG PAS le code en production ; en dev
    // on l'expose pour permettre le test du parcours via le simulateur.
    const meta: Record<string, unknown> = {
      ninaMasked: maskNina(nina),
      phoneMasked: maskPhone(officialPhone),
    };
    if (process.env.NODE_ENV !== 'production') meta.devOtp = code;
    this.logger.info(meta, 'OTP USSD émis (binding phone↔NINA)');
  }

  /**
   * Vérifie le code saisi par l'utilisateur (temps constant + essais bornés).
   *
   * @param sessionId - Session USSD du défi.
   * @param input - Code saisi.
   * @returns `true` si le code est correct et non expiré ; `false` sinon.
   */
  verify(sessionId: string, input: string): boolean {
    const otp = this.pending.get(sessionId);
    if (!otp) return false;
    if (otp.expiresAt <= Date.now()) {
      this.pending.delete(sessionId);
      return false;
    }
    if (otp.attemptsLeft <= 0) {
      this.pending.delete(sessionId);
      return false;
    }
    otp.attemptsLeft -= 1;

    const ok = constantTimeEquals(input.trim(), otp.code);
    if (ok || otp.attemptsLeft <= 0) this.pending.delete(sessionId);
    return ok;
  }
}

/**
 * Comparaison à temps constant SANS court-circuit de longueur.
 *
 * Le code saisi est attaquant-contrôlé et de FAIBLE entropie (6 chiffres) : un
 * court-circuit `length !== length` fuiterait la longueur attendue de l'OTP via
 * le temps de réponse. On hache donc LES DEUX côtés en SHA-256 (sortie de
 * longueur FIXE — 32 octets) avant `timingSafeEqual` : plus aucun retour
 * anticipé dépendant de la longueur, et l'égalité des digests implique l'égalité
 * des entrées (résistance aux collisions de SHA-256).
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}
