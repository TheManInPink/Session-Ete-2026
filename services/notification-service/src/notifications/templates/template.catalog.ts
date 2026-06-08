/**
 * @file        template.catalog.ts
 * @description Catalogue des templates transactionnels NINA-AES (métadonnées).
 *              Le CONTENU (texte par langue) vit dans `locales/<lang>.json` ;
 *              ce catalogue déclare les canaux servis et les variables
 *              obligatoires (validées avant rendu pour éviter un SMS avec un
 *              `{id}` non substitué).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/templates
 */
import { NotificationChannel } from '../channels/channel.types.js';
import type { TemplateDef } from './template.types.js';

const { SMS, EMAIL } = NotificationChannel;

/** Liste figée des templates supportés. */
export const TEMPLATES: readonly TemplateDef[] = [
  {
    key: 'correction-submitted',
    channels: [SMS, EMAIL],
    requiredVars: ['id'],
    description: 'Accusé de réception d’une demande de correction NINA.',
  },
  {
    key: 'correction-approved',
    channels: [SMS, EMAIL],
    requiredVars: ['id'],
    description: 'Notification d’approbation d’une demande de correction.',
  },
  {
    key: 'appointment-confirmed',
    channels: [SMS, EMAIL],
    requiredVars: ['date', 'location'],
    description: 'Confirmation d’un rendez-vous (CTDEC / antenne RAVEC).',
  },
  {
    key: 'appointment-reminder-24h',
    channels: [SMS],
    requiredVars: ['date', 'location'],
    description: 'Rappel de rendez-vous 24 h avant l’échéance.',
  },
  {
    key: 'appointment-reminder-2h',
    channels: [SMS],
    requiredVars: ['heure', 'location'],
    description: 'Rappel de rendez-vous 2 h avant l’échéance (jour J).',
  },
  {
    key: 'appointment-cancelled',
    channels: [SMS, EMAIL],
    requiredVars: ['date', 'location'],
    description: 'Confirmation d’annulation d’un rendez-vous (CTDEC / antenne RAVEC).',
  },
  {
    key: 'mfa-code',
    channels: [SMS],
    requiredVars: ['code', 'ttl'],
    description: 'Code d’authentification à usage unique (MFA).',
  },
  {
    key: 'whistleblower-token',
    channels: [SMS],
    requiredVars: ['token'],
    description: 'Jeton de suivi anonyme d’un signalement SIGAC.',
  },
  {
    key: 'ussd-confirmation',
    channels: [SMS],
    requiredVars: ['ref'],
    description: 'Confirmation courte d’une opération initiée via USSD.',
  },
] as const;

/** Index clé → définition (lookup O(1)). */
export const TEMPLATE_BY_KEY: ReadonlyMap<string, TemplateDef> = new Map(
  TEMPLATES.map((t) => [t.key, t]),
);
