/**
 * @file        centers.repository.ts
 * @description Accès PostgreSQL aux centres d'enrôlement via le client Prisma
 *              partagé. Un « centre » = une `Institution` dotée d'un profil
 *              `EnrollmentCenter` (1:1). L'identifiant public exposé est
 *              `Institution.id` (= `centerId` des rendez-vous).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/centers
 */
import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@nina-aes/database';
import { ACTIVE_OCCUPANCY_STATUSES } from '../appointments/appointment.enums.js';

/** Ligne centre jointe à son institution et à sa localisation. */
export type CenterRow = Prisma.EnrollmentCenterGetPayload<{
  include: { institution: { include: { location: true } } };
}>;

const CENTER_INCLUDE = {
  institution: { include: { location: true } },
} satisfies Prisma.EnrollmentCenterInclude;

@Injectable()
export class CentersRepository {
  /** Liste tous les centres actifs (avec institution + localisation). */
  findActiveCenters(): Promise<CenterRow[]> {
    return prisma.enrollmentCenter.findMany({
      where: { isActive: true },
      include: CENTER_INCLUDE,
      orderBy: { institution: { name: 'asc' } },
    });
  }

  /**
   * Récupère un centre par l'identifiant de son institution (= centerId public).
   *
   * @param institutionId UUID de l'institution hôte.
   */
  findByInstitutionId(institutionId: string): Promise<CenterRow | null> {
    return prisma.enrollmentCenter.findUnique({
      where: { institutionId },
      include: CENTER_INCLUDE,
    });
  }

  /** Résout les noms de localisations par codes (pour afficher région/cercle). */
  async findLocationNames(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const rows = await prisma.location.findMany({
      where: { code: { in: codes } },
      select: { code: true, name: true },
    });
    return new Map(rows.map((r) => [r.code, r.name]));
  }

  /**
   * Heures de début (`scheduledAt`) des RDV ACTIFS d'un centre sur un intervalle
   * — sert au calcul d'occupation (quotas + capacité par créneau).
   *
   * @param centerId UUID de l'institution (centerId).
   * @param from     Borne basse (incluse).
   * @param to       Borne haute (exclue).
   */
  findActiveSchedules(centerId: string, from: Date, to: Date): Promise<{ scheduledAt: Date }[]> {
    return prisma.appointment.findMany({
      where: {
        centerId,
        status: { in: ACTIVE_OCCUPANCY_STATUSES },
        scheduledAt: { gte: from, lt: to },
      },
      select: { scheduledAt: true },
    });
  }
}
