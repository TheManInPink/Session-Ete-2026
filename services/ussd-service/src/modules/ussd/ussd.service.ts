/**
 * @file        ussd.service.ts
 * @description Moteur de la machine d'états USSD.
 *
 *              CONVENTION DE PROTOCOLE Africa's Talking :
 *              - Body entrant : { sessionId, serviceCode, phoneNumber, text }
 *              - `text` est la CONCATÉNATION de toutes les entrées utilisateur
 *                séparées par `*`. Ex. `1*2*1721234567890A` signifie qu'il a
 *                tapé d'abord `1`, puis `2`, puis le NINA.
 *              - Réponse : "CON <message>" pour continuer, "END <message>" pour terminer.
 *              - Max 182 caractères par message (limite GSM).
 *
 *              ARCHITECTURE :
 *              On extrait la DERNIÈRE entrée de `text` (= entrée courante) et
 *              on dispatche selon l'état de la session. Pour les états
 *              complexes (saisie multi-écrans), on stocke les données
 *              partielles dans `session.data`.
 *
 *              MVP : seul le flow "Vérifier mon NINA" est implémenté. Les
 *              autres options (RDV, suivi, signalement) renvoient un
 *              message "À venir". Implémentation complète : Prompt 3.9.
 *
 * @module      ussd-service/ussd
 */

import { Injectable } from '@nestjs/common';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { maskNina, maskPhone } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

import { SessionService } from './session.service.js';
import { SUPPORTED_LANGUAGES, t, type SupportedLanguage } from './i18n.js';

/**
 * Format d'une requête USSD entrante (webhook Africa's Talking).
 * Validation par Zod ou class-validator dans le DTO du controller.
 */
export interface UssdCallbackInput {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  /** Texte cumulé : ex. "1*2*1721234567890A". Vide au premier appel. */
  text: string;
}

/**
 * Réponse au format Africa's Talking : préfixe `CON` (continuer) ou `END`
 * (terminer la session), suivi du message à afficher.
 */
export interface UssdCallbackOutput {
  /** Texte text/plain à renvoyer. */
  text: string;
}

const NINA_REGEX = /^[12]\d{13}[A-Z]$/;

@Injectable()
export class UssdService {
  constructor(
    private readonly sessions: SessionService,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Gère un callback USSD entrant et renvoie la prochaine réponse à
   * afficher sur l'écran du téléphone.
   *
   * @param input - Payload validé en amont.
   * @returns Réponse text/plain à renvoyer telle quelle à Africa's Talking.
   */
  async handle(input: UssdCallbackInput): Promise<UssdCallbackOutput> {
    const log = this.logger.withContext({
      sessionId: input.sessionId,
      extra: { phone: maskPhone(input.phoneNumber) },
    });

    // Récupère ou crée la session
    let session = this.sessions.get(input.sessionId);
    if (!session) {
      session = this.sessions.create(input.sessionId, input.phoneNumber);
      log.info('Nouvelle session USSD');
    }

    // Extrait l'entrée courante (dernière étape du `text`)
    const steps = input.text === '' ? [] : input.text.split('*');
    const currentInput = steps.length > 0 ? (steps[steps.length - 1] ?? '') : '';

    log.debug({ state: session.state, stepsCount: steps.length, currentInput }, 'Dispatch USSD');

    // Dispatch selon l'état
    try {
      switch (session.state) {
        case 'LANG_SELECT':
          return this.handleLanguageSelect(session.sessionId, currentInput, steps);
        case 'MAIN_MENU':
          return this.handleMainMenu(session.sessionId, currentInput, session.language);
        case 'VERIFY_NINA_INPUT':
          return this.handleVerifyNina(session.sessionId, currentInput, session.language);
        case 'VERIFY_NINA_RESULT':
        case 'GOODBYE':
          return this.endSession(session.sessionId, t('goodbye', session.language));
        default:
          // Cas qui ne devrait jamais arriver — tour de sécurité.
          log.error({ state: session.state }, 'État USSD inconnu');
          return this.endSession(session.sessionId, t('internal_error', session.language));
      }
    } catch (err) {
      // Garde-fou ABSOLU : aucune erreur ne doit échapper du handler.
      // L'opérateur télécom ferme la session si on ne répond pas correctement.
      log.error({ err }, 'Erreur dans handle USSD');
      return this.endSession(input.sessionId, t('internal_error', session.language));
    }
  }

  /**
   * Premier écran : sélection de la langue.
   */
  private handleLanguageSelect(
    sessionId: string,
    currentInput: string,
    steps: string[],
  ): UssdCallbackOutput {
    // Premier appel (text vide) : on affiche le menu de langue
    if (steps.length === 0) {
      return { text: `CON ${t('language_select', 'fr')}` };
    }

    // L'utilisateur a tapé un chiffre
    const choice = Number.parseInt(currentInput, 10);
    if (Number.isNaN(choice) || choice < 1 || choice > SUPPORTED_LANGUAGES.length) {
      // Choix invalide → on redemande
      return { text: `CON ${t('language_select', 'fr')}` };
    }
    const lang = SUPPORTED_LANGUAGES[choice - 1] ?? 'fr';

    this.sessions.update(sessionId, {
      language: lang,
      state: 'MAIN_MENU',
    });

    return { text: `CON ${t('main_menu', lang)}` };
  }

  /**
   * Menu principal : dispatch vers les sous-flows.
   */
  private handleMainMenu(
    sessionId: string,
    currentInput: string,
    lang: SupportedLanguage,
  ): UssdCallbackOutput {
    switch (currentInput) {
      case '1':
        // Flow "Vérifier mon NINA"
        this.sessions.update(sessionId, { state: 'VERIFY_NINA_INPUT' });
        return { text: `CON ${t('enter_nina', lang)}` };
      case '2':
      case '3':
      case '4':
        // À implémenter dans Prompt 3.9 — délégation aux services aval
        // via api-gateway (appointment, identity, anticorruption).
        return this.endSession(sessionId, `À venir. ${t('goodbye', lang)}`);
      case '5':
        // Retour au sélecteur de langue
        this.sessions.update(sessionId, { state: 'LANG_SELECT' });
        return { text: `CON ${t('language_select', lang)}` };
      default:
        return { text: `CON ${t('main_menu', lang)}` };
    }
  }

  /**
   * Flow "Vérifier mon NINA" — saisie + appel identity-service via api-gateway.
   *
   * MVP : on valide juste le format. L'appel HTTP réel à identity-service
   * sera ajouté dans la 2e passe (Prompt 3.9).
   */
  private handleVerifyNina(
    sessionId: string,
    currentInput: string,
    lang: SupportedLanguage,
  ): UssdCallbackOutput {
    const nina = currentInput.toUpperCase().trim();

    if (!NINA_REGEX.test(nina)) {
      return this.endSession(sessionId, t('invalid_nina', lang));
    }

    this.logger.info(
      { ninaMasked: maskNina(nina), action: 'verify' },
      'Vérification NINA via USSD',
    );

    // TODO Prompt 3.9 : appel HTTP GET /api/v1/citizens/:nina via api-gateway.
    // Pour le MVP, on simule un retour "trouvé".
    const message = `${nina.charAt(0)}${'*'.repeat(13)}${nina.charAt(14)}\nOK. ${t('goodbye', lang)}`;

    return this.endSession(sessionId, message);
  }

  /**
   * Termine la session côté Africa's Talking (préfixe END).
   */
  private endSession(sessionId: string, message: string): UssdCallbackOutput {
    this.sessions.destroy(sessionId);
    // Tronque à 182 caractères pour respecter la limite GSM
    const truncated = message.length > 178 ? `${message.slice(0, 175)}...` : message;
    return { text: `END ${truncated}` };
  }

  /**
   * Pour debug / tests : récupère la session courante (sans la modifier).
   */
  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }
}
