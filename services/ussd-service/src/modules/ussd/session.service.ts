/**
 * @file        session.service.ts
 * @description Gestion des sessions USSD stateful.
 *
 *              POURQUOI stateful : un protocole USSD échange par requêtes
 *              successives. Chaque interaction reçoit le `sessionId` de
 *              l'opérateur + le texte cumulé saisi par l'utilisateur. Il faut
 *              maintenir un état (langue, étape, données partielles) entre
 *              les appels.
 *
 *              IMPLÉMENTATION : Redis est le choix naturel (TTL natif, atomic
 *              operations). MVP : storage en mémoire — Redis sera ajouté
 *              dans une 2e passe (Prompt 3.9 du v3.0).
 *
 *              ⚠️ TTL critique : 5 min. Si une session traîne (utilisateur
 *              part en réunion en plein milieu d'un menu), elle DOIT être
 *              purgée pour éviter la fuite de mémoire et la confusion à la
 *              reconnexion.
 *
 * @module      ussd-service/ussd/session
 */

import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from './i18n.js';

/**
 * États possibles d'une session.
 * À étendre quand on implémente les flows réels (RDV, suivi, signalement).
 */
export type UssdState =
  | 'LANG_SELECT' // Choix de la langue (premier écran)
  | 'MAIN_MENU' // Menu principal
  | 'VERIFY_NINA_INPUT' // Saisie du NINA pour vérification
  | 'VERIFY_NINA_RESULT' // Résultat affiché, attend retour menu
  | 'GOODBYE'; // Session terminée

export interface UssdSession {
  sessionId: string;
  phoneNumber: string;
  language: SupportedLanguage;
  state: UssdState;
  /** Données accumulées pendant le flow (ex. NINA saisi partiellement). */
  data: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/** Durée de vie d'une session en millisecondes. */
export const SESSION_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  /**
   * Storage en mémoire pour le MVP. À remplacer par Redis (ioredis) :
   *   set("ussd:session:<id>", JSON.stringify(session), 'EX', 300)
   */
  private readonly sessions = new Map<string, UssdSession>();

  /**
   * Récupère une session active, ou retourne `undefined` si absente ou expirée.
   *
   * EFFET DE BORD : purge la session si elle a dépassé son TTL.
   */
  get(sessionId: string): UssdSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const ageMs = Date.now() - session.updatedAt.getTime();
    if (ageMs > SESSION_TTL_MS) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  /**
   * Crée une nouvelle session (premier appel d'un numéro de téléphone).
   */
  create(sessionId: string, phoneNumber: string): UssdSession {
    const session: UssdSession = {
      sessionId,
      phoneNumber,
      language: 'fr', // défaut, sera ajusté à la sélection
      state: 'LANG_SELECT',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Met à jour une session existante (état, langue, data).
   *
   * @returns La session mise à jour, ou `undefined` si la session n'existe plus.
   */
  update(
    sessionId: string,
    patch: Partial<Omit<UssdSession, 'sessionId' | 'phoneNumber' | 'createdAt'>>,
  ): UssdSession | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;
    const updated: UssdSession = {
      ...existing,
      ...patch,
      data: { ...existing.data, ...(patch.data ?? {}) },
      updatedAt: new Date(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Détruit explicitement une session (fin de parcours, ou erreur).
   */
  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
