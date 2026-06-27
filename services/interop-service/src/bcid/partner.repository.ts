/**
 * @file        partner.repository.ts
 * @description Accès Prisma aux partenaires AES (`aes_partners`) et au journal de
 *              vérifications (`aes_verification_logs`). Source de vérité pour
 *              `assertPeerKnown` (cert pair connu/non révoqué) et
 *              `fetchPeerPublicKey` (clé publique JWS du pair).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { Injectable } from '@nestjs/common';
import { prisma, type AesPartner, type AesVerificationLog } from '@nina-aes/database';

@Injectable()
export class PartnerRepository {
  /**
   * Récupère un partenaire ACTIF par fingerprint de cert mTLS. Filtre
   * `revokedAt: null`, `status: 'ACTIVE'` et la fenêtre de validité — un cert
   * inconnu/révoqué/expiré renvoie `null` (le caller lèvera 403).
   *
   * @param country     Pays attendu (issu du cert mTLS réel).
   * @param fingerprint SHA-256 (hex) du cert pair.
   */
  findActiveByFingerprint(country: string, fingerprint: string): Promise<AesPartner | null> {
    const now = new Date();
    return prisma.aesPartner.findFirst({
      where: {
        country,
        certFingerprint: fingerprint,
        revokedAt: null,
        status: 'ACTIVE',
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
    });
  }

  /** Récupère le partenaire ACTIF d'un pays (pour signer/adresser un appel sortant). */
  findActiveByCountry(country: string): Promise<AesPartner | null> {
    const now = new Date();
    return prisma.aesPartner.findFirst({
      where: {
        country,
        revokedAt: null,
        status: 'ACTIVE',
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      orderBy: { validFrom: 'desc' },
    });
  }

  /** Insère une entrée d'audit de vérification (append-only). */
  createVerificationLog(data: {
    requesterCountry: string;
    responderCountry: string;
    requestedNinaHash: string;
    requestType: string;
    requestId: string;
    jti: string;
    purpose: string;
    result: string;
    responseExists: boolean;
    responseValid: boolean;
    latencyMs: number;
    signature: string;
    jwsSignature: string;
    correlationId: string;
    clientIp: string | null;
  }): Promise<AesVerificationLog> {
    return prisma.aesVerificationLog.create({ data });
  }

  /**
   * Statistiques par pays sur les N dernières heures (alimente le dashboard
   * governance « Interop AES »).
   *
   * @param sinceHours Fenêtre de calcul (heures).
   */
  async statsByCountry(
    sinceHours: number,
  ): Promise<Array<{ requesterCountry: string; total: number }>> {
    const since = new Date(Date.now() - sinceHours * 3_600_000);
    const grouped = await prisma.aesVerificationLog.groupBy({
      by: ['requesterCountry'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ requesterCountry: g.requesterCountry, total: g._count._all }));
  }
}
