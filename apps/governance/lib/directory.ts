/**
 * @file        directory.ts
 * @description Annuaire des hauts fonctionnaires — résolution `userId → nom`.
 *
 *              Les vues SGOGT/directives ne reçoivent que des identifiants nus
 *              (`senderId`, `createdById`, …). En mode mock, l'annuaire
 *              `MOCK_GOVERNANCE_DIRECTORY` du package api-client fournit les
 *              noms ; en mode live (annuaire backend non livré), tout UUID
 *              inconnu retombe sur un libellé neutre « Fonctionnaire xxxxxxxx »
 *              (8 premiers caractères de l'identifiant).
 *
 * @module      @nina-aes/governance
 */

import { MOCK_GOVERNANCE_DIRECTORY, type MockGovernanceOfficial } from '@nina-aes/api-client';

/** Identité affichable d'un fonctionnaire (nom + fonction éventuelle). */
export interface OfficialIdentity {
  name: string;
  /** Fonction/institution — `null` si l'identifiant est inconnu de l'annuaire. */
  title: string | null;
}

/** UUID RFC 4122 (les FK `User.id` du backend) — teste le format, pas la version. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Résout le nom d'un fonctionnaire à partir de son identifiant.
 *
 * @param userId - Identifiant (`User.id`) porté par le message ou la directive.
 * @returns L'entrée d'annuaire, ou un repli « Fonctionnaire {8 premiers
 *          caractères} » pour les identifiants inconnus (cas live).
 */
export function resolveOfficial(userId: string): OfficialIdentity {
  const entry = MOCK_GOVERNANCE_DIRECTORY.find((o) => o.id === userId);
  if (entry) return { name: entry.name, title: entry.title };
  return { name: `Fonctionnaire ${userId.slice(0, 8)}`, title: null };
}

/**
 * Destinataires proposés à la composition d'un message SGOGT : l'annuaire sans
 * l'utilisateur connecté, restreint aux identifiants UUID (le DTO serveur
 * `SendSgogtMessageDto` exige un `recipientId` UUID — l'id de session mock
 * `mock-gov-001` n'en est pas un et est donc exclu d'office).
 *
 * @param viewerId - Identifiant de l'utilisateur connecté (exclu de la liste).
 */
export function composeRecipients(viewerId: string): readonly MockGovernanceOfficial[] {
  return MOCK_GOVERNANCE_DIRECTORY.filter((o) => o.id !== viewerId && UUID_REGEX.test(o.id));
}
