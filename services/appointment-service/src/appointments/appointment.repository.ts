/**
 * @file        appointment.repository.ts
 * @description Accès PostgreSQL aux rendez-vous via le client Prisma partagé.
 *              Inclut les jointures minimales nécessaires aux vues (citoyen :
 *              téléphone + langue pour les SMS ; centre : nom pour les messages)
 *              et les requêtes des tâches planifiées (rappels, no-show).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */
import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@nina-aes/database';
import { startOfUtcDay, utcDateKey, utcMinutesOfDay } from '../common/time.util.js';
import { classifyKind } from '../centers/slots.util.js';
import {
  ACTIVE_OCCUPANCY_STATUSES,
  AppointmentStatus,
  type PriorityLevel,
  type VulnerabilityCategory,
} from './appointment.enums.js';

/** Jointures exposées par les vues (citoyen + centre). */
const APPT_INCLUDE = {
  citizen: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      preferredLanguage: true,
    },
  },
  center: { select: { id: true, name: true, code: true } },
} satisfies Prisma.AppointmentInclude;

/** Rendez-vous joint à son citoyen et son centre. */
export type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

/** Données de création d'un rendez-vous. */
export interface CreateAppointmentData {
  citizenId: string;
  centerId: string;
  scheduledAt: Date;
  purpose: string;
  priority: PriorityLevel;
  locationId?: string | null;
}

/** Levée quand une capacité est atteinte au moment de l'insertion (course perdue). */
export class SlotFullError extends Error {
  constructor() {
    super('SLOT_FULL');
    this.name = 'SlotFullError';
  }
}

/**
 * Capacité d'un centre vérifiée ATOMIQUEMENT à l'insertion (les 3 niveaux de la
 * grille : créneau, nature/jour, jour). Sans cette revérification en transaction,
 * la grille ne serait garantie qu'en lecture (fenêtre TOCTOU sous concurrence).
 */
export interface BookingCapacitySpec {
  /** Capacité d'un créneau = guichets parallèles. */
  perSlotCapacity: number;
  /** Plafond global du jour. */
  capacityPerDay: number;
  /** Quota de créneaux STANDARD/jour. */
  standardQuota: number;
  /** Quota de créneaux PRIORITAIRES/jour. */
  priorityQuota: number;
  /** Bornes de la fenêtre prioritaire (minutes depuis minuit) pour classer les RDV. */
  priorityFromMin: number;
  priorityToMin: number;
}

@Injectable()
export class AppointmentRepository {
  /**
   * Crée un RDV en SÉRIALISANT toutes les réservations du même (centre, JOUR) via
   * un verrou consultatif Postgres (`pg_advisory_xact_lock`), puis en revérifiant
   * les 3 niveaux de capacité DANS la transaction (créneau, nature/jour, jour).
   * Ferme la course TOCTOU : le pré-contrôle en lecture (getAvailability) ne
   * suffit pas, car deux requêtes concurrentes sur des créneaux DIFFÉRENTS du même
   * jour peuvent toutes deux le passer puis dépasser un quota journalier.
   *
   * Le verrou est pris au niveau JOUR (et non créneau) précisément pour
   * sérialiser les requêtes ciblant des créneaux distincts d'un même jour.
   *
   * @param data Données du RDV.
   * @param cap  Capacités à faire respecter atomiquement.
   * @throws SlotFullError si une capacité est atteinte au moment de l'insertion.
   */
  createBookingAtomic(
    data: CreateAppointmentData,
    cap: BookingCapacitySpec,
  ): Promise<AppointmentRow> {
    const dayStart = startOfUtcDay(data.scheduledAt);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const lockKey = `appt:${data.centerId}:${utcDateKey(data.scheduledAt)}`;
    const targetMs = data.scheduledAt.getTime();
    const targetKind = classifyKind(
      utcMinutesOfDay(data.scheduledAt),
      cap.priorityFromMin,
      cap.priorityToMin,
    );

    return prisma.$transaction(async (tx) => {
      // Verrou JOUR : sérialise toutes les réservations du centre pour ce jour.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const active = await tx.appointment.findMany({
        where: {
          centerId: data.centerId,
          status: { in: ACTIVE_OCCUPANCY_STATUSES },
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        select: { scheduledAt: true },
      });

      let perSlot = 0;
      let kindCount = 0;
      for (const a of active) {
        if (a.scheduledAt.getTime() === targetMs) perSlot += 1;
        const k = classifyKind(
          utcMinutesOfDay(a.scheduledAt),
          cap.priorityFromMin,
          cap.priorityToMin,
        );
        if (k === targetKind) kindCount += 1;
      }
      const kindQuota = targetKind === 'PRIORITY' ? cap.priorityQuota : cap.standardQuota;

      if (
        perSlot >= cap.perSlotCapacity ||
        active.length >= cap.capacityPerDay ||
        kindCount >= kindQuota
      ) {
        throw new SlotFullError();
      }

      return tx.appointment.create({
        data: {
          citizenId: data.citizenId,
          centerId: data.centerId,
          scheduledAt: data.scheduledAt,
          purpose: data.purpose,
          priority: data.priority,
          status: AppointmentStatus.SCHEDULED,
          locationId: data.locationId ?? null,
        },
        include: APPT_INCLUDE,
      });
    });
  }

  /** Lit un RDV (avec citoyen + centre) par id. */
  findById(id: string): Promise<AppointmentRow | null> {
    return prisma.appointment.findUnique({ where: { id }, include: APPT_INCLUDE });
  }

  /** Liste filtrée + paginée (du plus récent au plus ancien). */
  list(filter: {
    citizenId?: string;
    status?: AppointmentStatus;
    centerId?: string;
    skip?: number;
    take?: number;
  }): Promise<AppointmentRow[]> {
    return prisma.appointment.findMany({
      where: {
        ...(filter.citizenId ? { citizenId: filter.citizenId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.centerId ? { centerId: filter.centerId } : {}),
      },
      include: APPT_INCLUDE,
      orderBy: { scheduledAt: 'desc' },
      ...(filter.skip !== undefined ? { skip: filter.skip } : {}),
      ...(filter.take !== undefined ? { take: filter.take } : {}),
    });
  }

  /** Met à jour le statut (et champs associés) d'un RDV. */
  updateStatus(
    id: string,
    patch: {
      status: AppointmentStatus;
      queueNumber?: number | null;
      agentId?: string | null;
      completedAt?: Date | null;
      notes?: string | null;
    },
  ): Promise<AppointmentRow> {
    return prisma.appointment.update({
      where: { id },
      data: {
        status: patch.status,
        ...(patch.queueNumber !== undefined ? { queueNumber: patch.queueNumber } : {}),
        ...(patch.agentId !== undefined ? { agentId: patch.agentId } : {}),
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      },
      include: APPT_INCLUDE,
    });
  }

  /**
   * Transition de statut ATOMIQUE (compare-and-set) : ne met à jour que si le
   * statut courant est dans `fromStatuses`. Évite les courses (double check-in,
   * annulation d'un RDV déjà clôturé…).
   *
   * @returns `true` si CE process a réalisé la transition (1 ligne modifiée).
   */
  async transition(
    id: string,
    fromStatuses: AppointmentStatus[],
    to: AppointmentStatus,
    extra: { queueNumber?: number | null; agentId?: string | null; completedAt?: Date | null } = {},
  ): Promise<boolean> {
    const { count } = await prisma.appointment.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: {
        status: to,
        ...(extra.queueNumber !== undefined ? { queueNumber: extra.queueNumber } : {}),
        ...(extra.agentId !== undefined ? { agentId: extra.agentId } : {}),
        ...(extra.completedAt !== undefined ? { completedAt: extra.completedAt } : {}),
      },
    });
    return count === 1;
  }

  /** Nombre de RDV actifs (occupants) d'un citoyen à un instant donné. */
  countActiveForCitizen(citizenId: string): Promise<number> {
    return prisma.appointment.count({
      where: { citizenId, status: { in: ACTIVE_OCCUPANCY_STATUSES } },
    });
  }

  /** Nombre de no-shows d'un citoyen depuis `since` (fenêtre glissante). */
  countNoShowsSince(citizenId: string, since: Date): Promise<number> {
    return prisma.appointment.count({
      where: { citizenId, status: AppointmentStatus.NO_SHOW, scheduledAt: { gte: since } },
    });
  }

  /**
   * RDV planifiés (SCHEDULED) dont l'heure tombe dans [from, to[ — pour les
   * rappels (J-1, H-2). Inclut citoyen (téléphone/langue) et centre (nom).
   */
  findScheduledBetween(from: Date, to: Date): Promise<AppointmentRow[]> {
    return prisma.appointment.findMany({
      where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { gte: from, lt: to } },
      include: APPT_INCLUDE,
    });
  }

  /** RDV planifiés dont l'heure est dépassée de la grâce (candidats no-show). */
  findOverdueScheduled(cutoff: Date): Promise<AppointmentRow[]> {
    return prisma.appointment.findMany({
      where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { lt: cutoff } },
      include: APPT_INCLUDE,
    });
  }

  /** Lit plusieurs RDV par ids (vue file d'attente agent). */
  findByIds(ids: string[]): Promise<AppointmentRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.appointment.findMany({ where: { id: { in: ids } }, include: APPT_INCLUDE });
  }

  /**
   * Résout l'`User.id` interne depuis le `sub` Keycloak (claim JWT). Le claim
   * `sub` correspond à `users.keycloak_id`, PAS à `users.id` ; on doit donc
   * traduire avant d'écrire la FK `agent_id` (sinon violation d'intégrité).
   *
   * @returns L'`User.id` interne, ou `null` si l'agent n'est pas en base.
   */
  async findInternalUserId(keycloakId: string): Promise<string | null> {
    const u = await prisma.user.findUnique({ where: { keycloakId }, select: { id: true } });
    return u?.id ?? null;
  }

  /** Lit un citoyen (champs utiles aux RDV/notifications) ; null si introuvable/supprimé. */
  findCitizen(citizenId: string): Promise<{
    id: string;
    phoneNumber: string | null;
    preferredLanguage: string;
    vulnerabilityCategory: string | null;
  } | null> {
    return prisma.citizen.findUnique({
      where: { id: citizenId },
      select: { id: true, phoneNumber: true, preferredLanguage: true, vulnerabilityCategory: true },
    });
  }

  /**
   * Vérifie qu'une fiche de vulnérabilité ACTIVE existe pour ce citoyen et cette
   * catégorie (source de vérité du domaine vulnérabilité, partagée en base —
   * équivalent et compatible avec un futur appel HTTP à vulnerability-service).
   *
   * @returns `true` si une fiche active correspond.
   */
  async hasActiveVulnerability(
    citizenId: string,
    category: VulnerabilityCategory,
    today: Date,
  ): Promise<boolean> {
    const rec = await prisma.vulnerabilityRecord.findFirst({
      where: {
        citizenId,
        category,
        activeFrom: { lte: today },
        OR: [{ activeUntil: null }, { activeUntil: { gte: today } }],
      },
      select: { id: true },
    });
    return rec !== null;
  }

  /** Indique si une erreur Prisma est une violation d'unicité (P2002). */
  static isUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
