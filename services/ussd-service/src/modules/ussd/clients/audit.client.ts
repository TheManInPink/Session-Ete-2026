/**
 * @file        audit.client.ts
 * @description Auditeur des consultations NINA via USSD (doc 14 §4.5 + ADR-007).
 *
 *              EXIGENCE (RGPD-like) : TOUTE consultation NINA via USSD doit être
 *              tracée — succès, échec, ou refus (numéro non lié au NINA). La
 *              traçabilité des accès aux données personnelles est obligatoire.
 *
 *              CONFIDENTIALITÉ : le numéro appelant n'est JAMAIS journalisé en
 *              clair. On en stocke un HASH (SHA-256 tronqué) — suffisant pour
 *              détecter une campagne d'énumération (même hash → N NINA
 *              différents) SANS exposer le MSISDN. Le NINA est journalisé MASQUÉ
 *              (`maskNina`), jamais en clair.
 *
 *              ⏳ ÉTAT (MVP) : l'événement est émis dans le journal structuré
 *              (Loki) avec le tag `audit: true`. CIBLE (ADR-007) : publier sur
 *              le bus (`nina.events`) vers `audit-service` (hash-chain SHA-256).
 *              Le THREAT-MODEL §4.7-R note que ce producteur RabbitMQ n'est pas
 *              encore câblé ; le contrôle de minimisation (hash MSISDN, NINA
 *              masqué) est, lui, appliqué dès maintenant.
 *
 * @module      ussd-service/ussd/clients
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import type { StructuredLogger } from '@nina-aes/logger';

/** Résultat d'une consultation NINA auditée. */
export type NinaLookupResult = 'success' | 'not_found' | 'phone_mismatch' | 'rate_limited';

/** Entrée d'audit d'une consultation NINA (PII minimisée). */
export interface NinaLookupAudit {
  result: NinaLookupResult;
  /** NINA déjà MASQUÉ par l'appelant (`maskNina`). */
  ninaMasked: string;
  /** Numéro appelant en clair — sera HACHÉ ici, jamais journalisé brut. */
  phone: string;
  /** Identifiant citoyen (présent uniquement sur succès). */
  citizenId?: string;
}

@Injectable()
export class AuditClient {
  constructor(@InjectLogger() private readonly logger: StructuredLogger) {}

  /**
   * Enregistre une consultation NINA. Le numéro est haché avant journalisation.
   *
   * @param entry - Détails de la consultation (numéro en clair, haché ici).
   */
  recordNinaLookup(entry: NinaLookupAudit): void {
    this.logger.info(
      {
        audit: true,
        action: 'ussd.nina_lookup',
        result: entry.result,
        ninaMasked: entry.ninaMasked,
        // HASH du numéro — jamais le MSISDN en clair (anti-désanonymisation).
        phoneHash: this.hash(entry.phone),
        ...(entry.citizenId ? { citizenId: entry.citizenId } : {}),
      },
      'Audit consultation NINA (USSD)',
    );
  }

  /** SHA-256 tronqué — corrélation d'énumération sans exposer le MSISDN. */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }
}
