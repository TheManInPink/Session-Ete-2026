/**
 * @file        templates.repository.ts
 * @description Accès PostgreSQL aux TEMPLATES PROTÉGÉS (modèle `BiometricTemplate`,
 *              ISO/IEC 24745). Le template protégé (`protectedTemplate`, `bytea`)
 *              est comparé EN MÉMOIRE par distance — aucune méthode ne fait de
 *              recherche par égalité sur le template (qui n'aurait aucun sens pour
 *              de la distance, doc 25 §4.1). Aucune méthode ne renvoie le NINA.
 *
 *              Partagé par enrollment (création), verify (templates actifs
 *              multi-kids), identify (balayage 1:N restreint) et consent
 *              (effacement / révocation logique).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/templates
 */
import { Injectable } from '@nestjs/common';
import { prisma, BiometricKind, type BiometricTemplate } from '@nina-aes/database';

/** Données de création d'un template protégé. */
export interface CreateTemplateData {
  citizenId: string;
  kind: BiometricKind;
  protectedTemplate: Uint8Array;
  transformKid: string;
  protectionScheme: string;
  templateFormat: string;
  matchMetric: string;
  matchThreshold: number;
  capturedBy: string;
  consentSignerKid: string;
  consentJti: string;
  consentDocUrl?: string | null;
}

@Injectable()
export class TemplatesRepository {
  /** Existence du citoyen (anti-IDOR : on n'enrôle pas un citoyen inconnu). */
  findCitizen(citizenId: string): Promise<{ id: string } | null> {
    return prisma.citizen.findUnique({ where: { id: citizenId }, select: { id: true } });
  }

  /** Crée un template PROTÉGÉ. Renvoie l'id (BigInt sérialisé par l'appelant). */
  create(data: CreateTemplateData): Promise<BiometricTemplate> {
    return prisma.biometricTemplate.create({
      data: {
        citizenId: data.citizenId,
        kind: data.kind,
        protectedTemplate: Buffer.from(data.protectedTemplate),
        transformKid: data.transformKid,
        protectionScheme: data.protectionScheme,
        templateFormat: data.templateFormat,
        matchMetric: data.matchMetric,
        matchThreshold: data.matchThreshold,
        capturedBy: data.capturedBy,
        consentSignerKid: data.consentSignerKid,
        consentJti: data.consentJti,
        consentDocUrl: data.consentDocUrl ?? null,
      },
    });
  }

  /**
   * Templates ACTIFS (non révoqués) d'un citoyen pour un type. Peut renvoyer
   * PLUSIEURS templates de kids différents pendant une rotation en double-écriture
   * (doc 25 §4.5) — la boucle `verify` les parcourt TOUS.
   */
  findActiveByCitizen(citizenId: string, kind: BiometricKind): Promise<BiometricTemplate[]> {
    return prisma.biometricTemplate.findMany({
      where: { citizenId, kind, revokedAt: null },
      orderBy: { capturedAt: 'desc' },
    });
  }

  /**
   * Tous les templates ACTIFS d'un type (balayage 1:N restreint — P3c). Sélection
   * minimale (id, citizenId, template, kid, seuil). ⚠️ À remplacer par un index
   * ANN sur les templates protégés en production (doc 25 §0.6, §4.1).
   */
  findAllActive(kind: BiometricKind): Promise<BiometricTemplate[]> {
    return prisma.biometricTemplate.findMany({
      where: { kind, revokedAt: null },
      orderBy: { capturedAt: 'desc' },
    });
  }

  /** Effacement EFFECTIF (hard delete) des templates d'un citoyen — droit à l'effacement. */
  async hardDeleteByCitizen(citizenId: string): Promise<number> {
    const res = await prisma.biometricTemplate.deleteMany({ where: { citizenId } });
    return res.count;
  }

  /**
   * Révocation LOGIQUE des templates d'un `transform_kid` pour un citoyen donné
   * (rotation/incident — le matching ignore les templates révoqués, §4.5).
   */
  async revokeByKidForCitizen(
    citizenId: string,
    transformKid: string,
    reason: string,
  ): Promise<number> {
    const res = await prisma.biometricTemplate.updateMany({
      where: { citizenId, transformKid, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count;
  }
}
