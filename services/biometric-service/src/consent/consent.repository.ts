/**
 * @file        consent.repository.ts
 * @description Accès PostgreSQL au registre de consentement biométrique (modèle
 *              `BiometricConsent`). Persiste la preuve vérifiée (anti-rejeu par
 *              `jti` unique) et gère la révocation (droit de retrait → effacement).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { Injectable } from '@nestjs/common';
import { prisma, type BiometricConsent } from '@nina-aes/database';

/** Données de persistance d'un consentement vérifié. */
export interface PersistConsentData {
  citizenId: string;
  jti: string;
  signerKid: string;
  scope: string;
  channel: string;
  lang: string;
  consentJws: string;
  issuedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ConsentRepository {
  /** Existence du citoyen (anti-IDOR : on n'enregistre pas pour un citoyen inconnu). */
  findCitizen(citizenId: string): Promise<{ id: string } | null> {
    return prisma.citizen.findUnique({ where: { id: citizenId }, select: { id: true } });
  }

  /** Persiste un consentement vérifié (le `jti` unique bloque le rejeu). */
  create(data: PersistConsentData): Promise<BiometricConsent> {
    return prisma.biometricConsent.create({
      data: {
        citizenId: data.citizenId,
        jti: data.jti,
        signerKid: data.signerKid,
        scope: data.scope,
        channel: data.channel,
        lang: data.lang,
        consentJws: data.consentJws,
        issuedAt: data.issuedAt,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Lit un consentement actif (non révoqué) le plus récent pour un citoyen. */
  findActiveByCitizen(citizenId: string): Promise<BiometricConsent | null> {
    return prisma.biometricConsent.findFirst({
      where: { citizenId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Indique si le citoyen a AU MOINS un consentement ACTIF (non révoqué, non
   * expiré) — gate du MATCHING (verify 1:1 / identify). Le retrait du
   * consentement DOIT empêcher tout nouvel appariement, même si les templates ne
   * sont pas encore physiquement effacés (DPIA §5). Lecture seule, sans claim.
   *
   * @param citizenId Citoyen ciblé.
   * @returns `true` si un consentement actif existe (matching autorisé).
   */
  async hasActiveConsent(citizenId: string): Promise<boolean> {
    const n = await prisma.biometricConsent.count({
      where: { citizenId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return n > 0;
  }

  /**
   * CONSOMME ATOMIQUEMENT un crédit d'enrôlement sur le consentement actif le
   * plus récent couvrant `scope` (liaison per-opération, anti-réutilisation
   * illimitée). L'`updateMany` conditionnel (`enrollmentsUsed < maxEnrollments`)
   * garantit qu'un même crédit n'est jamais consommé deux fois en concurrence ;
   * renvoie le consentement consommé (signerKid/jti) ou `null` si aucun crédit
   * disponible (épuisé/expiré/révoqué/scope différent).
   *
   * @param citizenId Citoyen ciblé.
   * @param scope     Périmètre requis (ex. `enroll:FINGERPRINT`).
   * @returns Le consentement dont un crédit a été consommé, ou `null`.
   */
  async consumeForEnrollment(
    citizenId: string,
    scope: string,
  ): Promise<{ signerKid: string; jti: string } | null> {
    // 1) Cibler le consentement actif le plus récent couvrant le scope ET ayant
    //    encore un crédit. On vise un id précis pour une consommation atomique.
    const candidate = await prisma.biometricConsent.findFirst({
      where: {
        citizenId,
        scope,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        enrollmentsUsed: { lt: prisma.biometricConsent.fields.maxEnrollments },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, signerKid: true, jti: true, enrollmentsUsed: true },
    });
    if (!candidate) return null;

    // 2) Consommer ATOMIQUEMENT le crédit (garde optimiste sur la valeur lue) :
    //    si une autre requête a consommé entre-temps, `count === 0` → null.
    const res = await prisma.biometricConsent.updateMany({
      where: {
        id: candidate.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        enrollmentsUsed: candidate.enrollmentsUsed,
      },
      data: { enrollmentsUsed: { increment: 1 } },
    });
    if (res.count !== 1) return null;
    return { signerKid: candidate.signerKid, jti: candidate.jti };
  }

  /** Marque comme révoqués TOUS les consentements actifs d'un citoyen. */
  async revokeAllForCitizen(citizenId: string): Promise<number> {
    const res = await prisma.biometricConsent.updateMany({
      where: { citizenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  /**
   * Révoque le consentement ET efface les templates d'un citoyen de manière
   * ATOMIQUE (une seule transaction). Sans transaction, un échec du hard delete
   * après la révocation laisserait le consentement révoqué mais les templates
   * ENCORE MATCHABLES (échec partiel — risque de fix). Le gate de matching
   * (`hasActiveMatchingConsent`) refuse de toute façon dès la révocation, mais la
   * transaction garantit que révocation et effacement réussissent ou échouent
   * ENSEMBLE (DPIA §5, doc 25 §6).
   *
   * @param citizenId Citoyen exerçant son droit de retrait.
   * @returns Compteurs (consentements révoqués + templates effacés).
   */
  async revokeAndEraseForCitizen(
    citizenId: string,
  ): Promise<{ consentsRevoked: number; templatesErased: number }> {
    return prisma.$transaction(async (tx) => {
      const revoked = await tx.biometricConsent.updateMany({
        where: { citizenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const erased = await tx.biometricTemplate.deleteMany({ where: { citizenId } });
      return { consentsRevoked: revoked.count, templatesErased: erased.count };
    });
  }
}
