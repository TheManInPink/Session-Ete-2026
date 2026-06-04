/**
 * @file        appointment.enums.ts
 * @description Énumérations du domaine RDV sous forme d'objets `as const`. Les
 *              valeurs sont des littéraux de chaîne STRUCTURELLEMENT identiques
 *              aux enums Prisma (`AppointmentStatus`, `PriorityLevel`,
 *              `VulnerabilityCategory`), donc directement assignables aux types
 *              d'entrée Prisma sans cast — tout en évitant d'importer les valeurs
 *              runtime du client généré (cf. enums locaux de notification-service).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/appointments
 */

/** Cycle de vie d'un rendez-vous (aligné enum Prisma `AppointmentStatus`). */
export const AppointmentStatus = {
  /** Créé, en attente de planification / validation. */
  REQUESTED: 'REQUESTED',
  /** Créneau réservé, confirmation envoyée au citoyen. */
  SCHEDULED: 'SCHEDULED',
  /** Citoyen présenté au centre (check-in) ⇒ entré en file d'attente. */
  CONFIRMED: 'CONFIRMED',
  /** Service rendu au guichet. */
  COMPLETED: 'COMPLETED',
  /** Annulé (citoyen ou agent). */
  CANCELLED: 'CANCELLED',
  /** Absence constatée (jamais présenté). */
  NO_SHOW: 'NO_SHOW',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

/** Valeurs de statut (pour la validation des filtres + Swagger). */
export const APPOINTMENT_STATUS_VALUES = Object.values(AppointmentStatus) as AppointmentStatus[];

/** Niveau de priorité opérationnelle (aligné enum Prisma `PriorityLevel`). */
export const PriorityLevel = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
} as const;
export type PriorityLevel = (typeof PriorityLevel)[keyof typeof PriorityLevel];

/** Catégories de vulnérabilité (aligné enum Prisma `VulnerabilityCategory`). */
export const VULNERABILITY_CATEGORIES = [
  'ELDERLY',
  'DISABLED',
  'PREGNANT',
  'CHRONIC_ILL',
  'ILLITERATE',
  'DIASPORA',
] as const;
export type VulnerabilityCategory = (typeof VULNERABILITY_CATEGORIES)[number];

/** Statuts considérés comme « occupant » un créneau (comptés dans les quotas). */
export const ACTIVE_OCCUPANCY_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];
