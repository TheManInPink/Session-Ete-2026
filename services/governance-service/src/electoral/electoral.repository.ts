/**
 * @file        electoral.repository.ts
 * @description Accès PostgreSQL au registre électoral pseudonymisé
 *              (`ElectoralPseudonym`). Le NINA n'est lu qu'EN MÉMOIRE pour le
 *              calcul HMAC (jamais persisté en clair ici, jamais exporté).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Injectable } from '@nestjs/common';
import { prisma, type ElectoralPseudonym } from '@nina-aes/database';

/** Ligne du delta exporté vers la DGE (colonnes minimisées, sans PII directe). */
export interface VoterDeltaRow {
  pseudonymousId: string;
  region: string;
  cercle: string;
  commune: string | null;
  status: string;
  registeredAt: Date;
  removedAt: Date | null;
  removedReason: string | null;
}

/** Données d'inscription électorale. */
export interface InscribeData {
  citizenId: string;
  pseudonymousId: string;
  saltVersion: number;
  region: string;
  cercle: string;
  commune?: string | null;
  inscriptionType: 'AUTO_18' | 'MANUAL' | 'TRANSFER';
}

@Injectable()
export class ElectoralRepository {
  /**
   * Citoyens fêtant aujourd'hui leurs 18 ans et PAS encore au registre
   * pseudonymisé. Renvoie le NINA (usage HMAC en mémoire uniquement) + géo.
   *
   * @param lowerBound Borne basse de date de naissance (inclus).
   * @param upperBound Borne haute de date de naissance (exclus).
   */
  async newAdultsTurning18(lowerBound: Date, upperBound: Date) {
    return prisma.citizen.findMany({
      where: {
        birthDate: { gte: lowerBound, lt: upperBound },
        electoralPseudonym: null,
      },
      select: {
        id: true,
        nina: true,
        residence: { select: { name: true, code: true } },
      },
    });
  }

  /** Insère une ligne de registre pseudonymisé (idempotent via unique citizenId). */
  inscribe(data: InscribeData): Promise<ElectoralPseudonym> {
    return prisma.electoralPseudonym.create({
      data: {
        citizenId: data.citizenId,
        pseudonymousId: data.pseudonymousId,
        saltVersion: data.saltVersion,
        region: data.region,
        cercle: data.cercle,
        commune: data.commune ?? null,
        inscriptionType: data.inscriptionType,
      },
    });
  }

  /**
   * Delta du registre depuis `since` : lignes inscrites OU radiées après `since`.
   * Sélection MINIMISÉE (jamais `citizenId` ni NINA) + ordre DÉTERMINISTE
   * (pseudonyme) pour un CSV reproductible (même hash à contenu égal).
   */
  async delta(since: Date): Promise<VoterDeltaRow[]> {
    const rows = await prisma.electoralPseudonym.findMany({
      where: { OR: [{ registeredAt: { gte: since } }, { removedAt: { gte: since } }] },
      select: {
        pseudonymousId: true,
        region: true,
        cercle: true,
        commune: true,
        status: true,
        registeredAt: true,
        removedAt: true,
        removedReason: true,
      },
      orderBy: [{ pseudonymousId: 'asc' }],
    });
    return rows;
  }
}
