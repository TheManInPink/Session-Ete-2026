/**
 * @file        notification.repository.ts
 * @description Accès PostgreSQL au modèle `Notification` via le client Prisma
 *              partagé `@nina-aes/database`. Encapsule la persistance de
 *              l'historique (création, mise à jour de statut, idempotence,
 *              corrélation DLR par `providerId`).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */
import { Injectable } from '@nestjs/common';
import { prisma, Prisma, type Notification } from '@nina-aes/database';
import { NotificationChannel, NotificationStatus, type Lang } from './channels/channel.types.js';

/** Données de création d'une notification (historique). */
export interface CreateNotificationInput {
  recipientUserId?: string | null;
  recipientCitizenId?: string | null;
  channel: NotificationChannel;
  status?: NotificationStatus;
  templateKey: string;
  language: Lang;
  payload: Prisma.InputJsonValue;
  /** Clé d'idempotence (NULL pour les envois en masse non idempotents). */
  dedupeKey?: string | null;
  providerId?: string | null;
}

/** Mise à jour de statut (après envoi / DLR / échec). */
export interface UpdateNotificationStatusInput {
  status: NotificationStatus;
  providerId?: string | null;
  failureReason?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  retryCount?: number;
}

@Injectable()
export class NotificationRepository {
  /** Crée une ligne d'historique. */
  create(input: CreateNotificationInput): Promise<Notification> {
    return prisma.notification.create({
      data: {
        recipientUserId: input.recipientUserId ?? null,
        recipientCitizenId: input.recipientCitizenId ?? null,
        channel: input.channel,
        status: input.status ?? NotificationStatus.PENDING,
        templateKey: input.templateKey,
        language: input.language,
        payload: input.payload,
        dedupeKey: input.dedupeKey ?? null,
        providerId: input.providerId ?? null,
      },
    });
  }

  /** Lit une notification par son id (UUID). */
  findById(id: string): Promise<Notification | null> {
    return prisma.notification.findUnique({ where: { id } });
  }

  /** Recherche une notification existante par clé d'idempotence. */
  findByDedupeKey(dedupeKey: string): Promise<Notification | null> {
    return prisma.notification.findUnique({ where: { dedupeKey } });
  }

  /** Recherche par identifiant fournisseur (corrélation d'un DLR entrant). */
  findByProviderId(providerId: string): Promise<Notification | null> {
    return prisma.notification.findFirst({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Met à jour le statut (et champs associés) d'une notification. */
  updateStatus(id: string, patch: UpdateNotificationStatusInput): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: {
        status: patch.status,
        ...(patch.providerId !== undefined ? { providerId: patch.providerId } : {}),
        ...(patch.failureReason !== undefined ? { failureReason: patch.failureReason } : {}),
        ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt } : {}),
        ...(patch.deliveredAt !== undefined ? { deliveredAt: patch.deliveredAt } : {}),
        ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}),
      },
    });
  }

  /**
   * Reprend ATOMIQUEMENT une notification en échec pour ré-essai
   * (FAILED → PENDING). La condition `status: FAILED` dans le `WHERE` agit comme
   * un compare-and-set : un seul worker concurrent obtient `count === 1`, les
   * autres voient `count === 0` (la ligne n'est plus FAILED) ⇒ pas de double
   * expédition lors d'une course de ré-essai.
   *
   * @param id Identifiant de la notification.
   * @returns `true` si CE worker a obtenu le verrou (1 ligne mise à jour).
   */
  async claimForRetry(id: string): Promise<boolean> {
    const { count } = await prisma.notification.updateMany({
      where: { id, status: NotificationStatus.FAILED },
      data: { status: NotificationStatus.PENDING },
    });
    return count === 1;
  }

  /**
   * Indique si une erreur Prisma est une violation de contrainte d'unicité
   * (P2002) — utilisé pour détecter un doublon d'idempotence en concurrence.
   */
  static isUniqueViolation(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
