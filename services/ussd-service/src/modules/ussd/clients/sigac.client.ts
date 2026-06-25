/**
 * @file        sigac.client.ts
 * @description Soumission ANONYME d'un signalement de corruption (canal SIGAC
 *              via USSD) — protection du lanceur d'alerte (doc 14 §4.6.1, P0).
 *
 *              RÈGLES NON NÉGOCIABLES (anonymat > auditabilité ici) :
 *                1. Le `phoneNumber` n'est JAMAIS transmis ni journalisé (même
 *                   masqué). Aucun `maskPhone` sur ce chemin.
 *                2. Aucun correlation-id / sessionId / IP / NINA dans le payload
 *                   ni dans les logs.
 *                3. Le token de suivi dérive d'un SECRET ALÉATOIRE pur — JAMAIS
 *                   du numéro : impossible de remonter au plaignant via le token.
 *                4. Pas d'audit nominatif : au plus un compteur agrégé.
 *
 *              RISQUE RÉSIDUEL (honnêteté) : le MSISDN reste visible côté
 *              opérateur et côté Africa's Talking (tiers étranger) dans les CDR
 *              (numéro + horodatage + serviceCode `*123*…#`). NINA-AES ne peut
 *              PAS neutraliser ce risque structurel au canal USSD via agrégateur
 *              tiers (cf. THREAT-MODEL « Canal USSD / CDR opérateur »).
 *
 *              ⏳ ÉTAT (MVP) : le signalement est compté en agrégat (journal,
 *              sans attribut individuel). CIBLE : POST anonyme vers
 *              `anticorruption-service` (classification NLP + token).
 *
 * @module      ussd-service/ussd/clients
 */

import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

/** Charge utile d'un signalement anonyme : AUCUN champ identifiant. */
export interface AnonymousAlert {
  /** Description librement saisie (tronquée en amont). */
  description: string;
  /** Token de suivi NON dérivé du numéro. */
  trackingToken: string;
  /** Langue d'affichage (non identifiante). */
  language: string;
}

@Injectable()
export class SigacClient {
  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  /**
   * Génère un token de suivi à partir d'un secret aléatoire pur.
   * Le numéro N'EST PAS une entrée de ce hash (anti-désanonymisation).
   *
   * @returns Token 8 caractères hexadécimaux majuscules.
   */
  generateTrackingToken(): string {
    const secret = randomBytes(16);
    return createHash('sha256').update(secret).digest('hex').slice(0, 8).toUpperCase();
  }

  /**
   * Transmet le signalement anonyme. AUCUN identifiant n'est inclus : pas de
   * phone, pas de sessionId, pas d'IP, pas de NINA.
   *
   * @param alert - Description + token + langue uniquement.
   */
  submitAnonymous(alert: AnonymousAlert): void {
    // ⏳ MVP : POST anonyme vers anticorruption-service non câblé. On ne compte
    // qu'un événement AGRÉGÉ, sans aucun attribut individuel (ni token, ni
    // langue corrélables). VOLONTAIREMENT minimal : le moindre log corrélable
    // (timestamp précis + autre attribut) faciliterait la désanonymisation.
    void alert;
    this.logger.info({ audit: true, action: 'ussd.sigac_alert' }, 'Signalement anonyme reçu');
  }
}
