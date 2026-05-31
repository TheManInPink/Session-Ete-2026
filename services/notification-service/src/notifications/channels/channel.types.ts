/**
 * @file        channel.types.ts
 * @description Types et contrats partagés par les fournisseurs de canaux
 *              (SMS, email, push). Un `ChannelProvider` reçoit un message
 *              déjà rendu (texte final dans la bonne langue) et l'expédie via
 *              son transport ; il renvoie un statut normalisé indépendant du
 *              fournisseur.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/channels
 */

/** Langues nationales supportées (alignées sur l'enum Prisma `Language`). */
export const LANGUAGES = ['FR', 'BM', 'SNK', 'FF', 'TMQ', 'HAU', 'MOS', 'DJE'] as const;

/**
 * Type union des codes langue. Structurellement identique à l'enum Prisma
 * `Language` (union de littéraux) ⇒ assignable des deux côtés sans cast.
 */
export type Lang = (typeof LANGUAGES)[number];

/**
 * Canaux d'expédition. Les valeurs correspondent à la colonne `channel`
 * (VARCHAR) du modèle Prisma `Notification`.
 */
export enum NotificationChannel {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  /** Notification courte associée à une session USSD (expédiée en SMS). */
  USSD = 'USSD',
  VOICE = 'VOICE',
}

/**
 * Cycle de vie d'une notification — valeurs de la colonne `status` Prisma.
 *   PENDING   : créée, pas encore expédiée.
 *   SENT      : acceptée par le fournisseur (pas encore de DLR).
 *   DELIVERED : accusé de réception du réseau (webhook DLR).
 *   FAILED    : échec définitif (après épuisement des ré-essais).
 *   READ      : lue par le destinataire (push/email tracking — futur).
 */
export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  READ = 'READ',
}

/** Message prêt à l'expédition (texte déjà rendu dans la langue cible). */
export interface RenderedMessage {
  /** Adresse destinataire : numéro E.164 (SMS), email, ou jeton d'appareil (push). */
  recipient: string;
  /** Objet (email uniquement). */
  subject?: string;
  /** Corps texte (SMS/USSD) ou texte/HTML (email) / corps de notif (push). */
  body: string;
  /** Langue de rendu (pour journalisation / en-têtes fournisseur). */
  language: Lang;
  /** Données structurées additionnelles (payload `data` du push, par ex.). */
  data?: Record<string, string>;
}

/** Résultat normalisé d'un envoi via un canal. */
export interface ChannelSendResult {
  /** SENT si le fournisseur a accepté, FAILED sinon. */
  status: NotificationStatus.SENT | NotificationStatus.FAILED;
  /** Identifiant fournisseur (message id AT, messageId SMTP, name FCM…). */
  providerId?: string;
  /** Raison d'échec lisible (consignée en base + métriques). */
  failureReason?: string;
  /**
   * Échec DÉFINITIF (canal non supporté, destinataire invalide) : inutile de
   * ré-essayer ⇒ envoi direct en DLQ. Par défaut un échec est réessayable
   * (erreur réseau/fournisseur transitoire).
   */
  permanent?: boolean;
}

/**
 * Contrat d'un fournisseur de canal. Chaque implémentation est `@Injectable`
 * et déclare le `channel` qu'elle dessert ; le {@link ChannelDispatcher} les
 * indexe par canal.
 */
export interface ChannelProvider {
  /** Canal desservi par ce fournisseur. */
  readonly channel: NotificationChannel;
  /**
   * Expédie un message rendu.
   *
   * @param message Message déjà rendu (texte final).
   * @returns Statut normalisé (ne LÈVE PAS : les erreurs réseau renvoient FAILED).
   */
  send(message: RenderedMessage): Promise<ChannelSendResult>;
}

/**
 * Normalise une chaîne de canal arbitraire (API : "sms"|"email"|"push"…)
 * en {@link NotificationChannel}.
 *
 * @param input Valeur libre (insensible à la casse).
 * @returns Le canal correspondant, ou `null` si non reconnu.
 */
export function normalizeChannel(input: string): NotificationChannel | null {
  const v = input.trim().toUpperCase();
  return (Object.values(NotificationChannel) as string[]).includes(v)
    ? (v as NotificationChannel)
    : null;
}
