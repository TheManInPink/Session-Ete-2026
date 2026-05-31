/**
 * @file        template.types.ts
 * @description Types du moteur de templates multilingue.
 *
 *              Un template a une définition (catalogue : canaux servis +
 *              variables requises) et un contenu par langue (fichiers
 *              `locales/<lang>.json`). Le rendu interpole les variables
 *              `{nom}` et retombe sur le français si une langue/clé manque.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/templates
 */
import type { Lang, NotificationChannel } from '../channels/channel.types.js';

/** Contenu d'un template pour UN canal dans UNE langue. */
export interface ChannelTemplate {
  /** Corps SMS / USSD / push. */
  sms?: string;
  /** Variante email (objet + corps). */
  email?: { subject: string; body: string };
}

/** Fichier de langue : map clé de template → contenu par canal. */
export type LocaleFile = Record<string, ChannelTemplate>;

/** Définition (métadonnées) d'un template — indépendante de la langue. */
export interface TemplateDef {
  /** Clé unique (ex. `correction-submitted`). */
  key: string;
  /** Canaux pour lesquels un contenu existe. */
  channels: NotificationChannel[];
  /** Variables `{nom}` obligatoires pour le rendu. */
  requiredVars: string[];
  /** Description courte (affichée par GET /templates). */
  description: string;
}

/** Résultat d'un rendu. */
export interface RenderedTemplate {
  subject?: string;
  body: string;
  /** Langue réellement utilisée (peut différer si fallback FR). */
  language: Lang;
}
