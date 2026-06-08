/**
 * @file        job.types.ts
 * @description Forme « fil » (wire) d'un job de notification — l'objet
 *              sérialisé en JSON dans RabbitMQ et accepté par le cœur du
 *              service. Partagé par le service, le publisher et le consumer.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/notifications
 */

/** Job de notification (publié par d'autres services ou construit en interne). */
export interface NotificationJob {
  /** Adresse destinataire (E.164 / email / jeton push). */
  recipient: string;
  /** Canal forcé ("sms"|"email"|"push"|"ussd") ; sinon déduit. */
  channel?: string;
  /** Clé de template. */
  template: string;
  /** Variables d'interpolation. */
  variables?: Record<string, string | number>;
  /** Priorité opérationnelle (P1/P2/P3). */
  priority?: string;
  /** Code langue (FR/BM/…). */
  language?: string;
  /** FK historique : utilisateur destinataire. */
  recipientUserId?: string | null;
  /** FK historique : citoyen destinataire. */
  recipientCitizenId?: string | null;
  /** Clé d'idempotence explicite (sinon dérivée). */
  idempotencyKey?: string | null;
}
