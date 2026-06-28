/**
 * @file        inscription.service.ts
 * @description Inscription électorale AUTOMATIQUE à 18 ans (Bloc C3). Pour chaque
 *              citoyen fêtant ses 18 ans aujourd'hui et PAS encore inscrit, on
 *              calcule son `pseudonymousId` (HMAC Vault, clé non exportable) puis
 *              on l'insère au registre pseudonymisé. CHAQUE inscription est
 *              auditée (preuve d'inscription régulière), SANS NINA dans la trace.
 *
 *              Acteur = CRON système : `userId` audit laissé vide (validé
 *              `@IsUUID` côté audit-service) ; l'origine machine va dans
 *              `actorType` (`system:inscription-auto-cron`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, AuditPublisher } from '../audit/audit.publisher.js';
import { ElectoralRepository } from './electoral.repository.js';
import { PseudonymService } from './pseudonym.service.js';

/** Acteur machine pour l'audit (PAS un UUID → pas dans `userId`). */
const SYSTEM_ACTOR = 'system:inscription-auto-cron';

@Injectable()
export class InscriptionService {
  private readonly logger = new Logger(InscriptionService.name);

  constructor(
    private readonly repo: ElectoralRepository,
    private readonly pseudonym: PseudonymService,
    private readonly audit: AuditPublisher,
  ) {}

  /**
   * Inscrit les nouveaux majeurs du jour. Idempotent : la contrainte unique sur
   * `citizenId` + le filtre `electoralPseudonym: null` évitent les doublons ;
   * une erreur sur une ligne n'interrompt pas le lot (best-effort par citoyen).
   *
   * @param now Horodatage de référence (injectable pour les tests).
   * @returns Nombre de citoyens effectivement inscrits.
   */
  async inscribeNewAdults(now: Date = new Date()): Promise<number> {
    // Fenêtre [aujourd'hui-18ans, demain-18ans[ — tous ceux dont c'est
    // l'anniversaire des 18 ans aujourd'hui (UTC, borne jour).
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const lowerBound = new Date(startOfToday);
    lowerBound.setUTCFullYear(lowerBound.getUTCFullYear() - 18);
    const upperBound = new Date(lowerBound);
    upperBound.setUTCDate(upperBound.getUTCDate() + 1);

    const newAdults = await this.repo.newAdultsTurning18(lowerBound, upperBound);
    if (newAdults.length === 0) return 0;

    const saltVersion = this.pseudonym.currentSaltVersion();
    let inscribed = 0;

    for (const citizen of newAdults) {
      try {
        const pseudonymousId = await this.pseudonym.generate(citizen.nina, saltVersion);
        // `residence.name` = commune ; le code administratif porte la géo
        // hiérarchique. On dérive region/cercle de façon défensive.
        const region = citizen.residence?.code?.split('-')[1] ?? 'UNKNOWN';
        const cercle = citizen.residence?.code?.split('-')[2] ?? 'UNKNOWN';
        await this.repo.inscribe({
          citizenId: citizen.id,
          pseudonymousId,
          saltVersion,
          region,
          cercle,
          commune: citizen.residence?.name ?? null,
          inscriptionType: 'AUTO_18',
        });

        // Audit SANS NINA — seulement le pseudonyme + géo grossière.
        await this.audit.publish({
          action: AuditAction.VOTER_INSCRIBED_AUTO_18,
          entityType: 'ElectoralPseudonym',
          entityId: citizen.id,
          actorId: null, // acteur machine → pas un UUID
          actorType: SYSTEM_ACTOR,
          metadata: { pseudonym: pseudonymousId, saltVersion, region },
        });
        inscribed += 1;
      } catch (err) {
        // Une ligne en échec (ex. course / doublon) n'interrompt pas le lot.
        this.logger.warn(
          `Inscription auto échouée (citizenId=${citizen.id}) : ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Inscription électorale auto : ${inscribed}/${newAdults.length} nouveaux majeurs.`,
    );
    return inscribed;
  }
}
