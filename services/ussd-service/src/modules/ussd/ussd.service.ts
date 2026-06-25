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
 *              SÉCURITÉ (durcissement P0 — doc 14 §4.2 → §4.6.1) :
 *              - rate-limit par phone ET par NINA (anti-énumération, §4.2.2) ;
 *              - binding phone↔NINA : la fiche n'est révélée QUE si le numéro
 *                appelant == le téléphone enregistré du citoyen, sinon 2ᵉ
 *                facteur SMS (§4.5) ;
 *              - audit de TOUTE consultation NINA (numéro haché, NINA masqué) ;
 *              - parcours SIGAC ANONYME : zéro log du numéro, token non dérivé
 *                du numéro, session détruite immédiatement (§4.6.1).
 *
 *              ⏳ MVP : les flows « 2. RDV » et « 3. Suivi » restent « À venir ».
 *              Le flow « 4. Signaler » (SIGAC anonyme) est implémenté ici car
 *              c'est un contrôle de sécurité P0 (protection lanceur d'alerte).
 *
 * @module      ussd-service/ussd
 */

import { Injectable } from '@nestjs/common';
import { InjectLogger } from '@nina-aes/logger/nestjs';
import { maskNina, maskPhone } from '@nina-aes/logger';
import type { StructuredLogger } from '@nina-aes/logger';

import { SessionService } from './session.service.js';
import { SUPPORTED_LANGUAGES, t, type SupportedLanguage } from './i18n.js';
import { RateLimitStore } from './rate-limit.store.js';
import { IdentityClient } from './clients/identity.client.js';
import { AuditClient } from './clients/audit.client.js';
import { SmsOtpClient } from './clients/sms-otp.client.js';
import { SigacClient } from './clients/sigac.client.js';

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
    private readonly rateLimit: RateLimitStore,
    private readonly identity: IdentityClient,
    private readonly audit: AuditClient,
    private readonly smsOtp: SmsOtpClient,
    private readonly sigac: SigacClient,
    @InjectLogger() private readonly logger: StructuredLogger,
  ) {}

  /**
   * Gère un callback USSD entrant et renvoie la prochaine réponse à
   * afficher sur l'écran du téléphone.
   *
   * @param input - Payload validé en amont (caller déjà authentifié par le guard).
   * @returns Réponse text/plain à renvoyer telle quelle à Africa's Talking.
   */
  async handle(input: UssdCallbackInput): Promise<UssdCallbackOutput> {
    const log = this.logger.withContext({
      sessionId: input.sessionId,
      extra: { phone: maskPhone(input.phoneNumber) },
    });

    // ── Rate-limit PAR NUMÉRO (anti-énumération, §4.2.2) ────────────────────
    // Appliqué AVANT toute logique : casse le balayage automatisé. Message
    // NEUTRE — on ne confirme jamais quoi que ce soit à un attaquant.
    if (this.rateLimit.isBlockedByPhone(input.phoneNumber)) {
      log.warn({ reason: 'rate_limited_phone' }, 'Requête USSD bloquée (quota numéro)');
      this.sessions.destroy(input.sessionId);
      return { text: `END ${t('rate_limited', 'fr')}` };
    }

    // Récupère ou crée la session
    let session = this.sessions.get(input.sessionId);
    if (!session) {
      session = this.sessions.create(input.sessionId, input.phoneNumber);
      log.info('Nouvelle session USSD');
    }

    // Extrait l'entrée courante (dernière étape du `text`)
    const steps = input.text === '' ? [] : input.text.split('*');
    const currentInput = steps.length > 0 ? (steps[steps.length - 1] ?? '') : '';

    log.debug({ state: session.state, stepsCount: steps.length }, 'Dispatch USSD');

    // Dispatch selon l'état
    try {
      switch (session.state) {
        case 'LANG_SELECT':
          return this.handleLanguageSelect(session.sessionId, currentInput, steps);
        case 'MAIN_MENU':
          return this.handleMainMenu(session.sessionId, currentInput, session.language);
        case 'VERIFY_NINA_INPUT':
          return await this.handleVerifyNina(
            session.sessionId,
            input.phoneNumber,
            currentInput,
            session.language,
          );
        case 'VERIFY_NINA_OTP':
          return await this.handleVerifyNinaOtp(
            session.sessionId,
            input.phoneNumber,
            currentInput,
            session.language,
            session.data.nina ?? '',
          );
        case 'ALERT_INPUT':
          return this.handleAlertInput(session.sessionId, currentInput, session.language);
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
        // À implémenter dans Prompt 3.9 — délégation aux services aval
        // via api-gateway (appointment, identity).
        return this.endSession(sessionId, `À venir. ${t('goodbye', lang)}`);
      case '4':
        // Flow "Signaler un problème" (SIGAC) — parcours ANONYME (§4.6.1).
        // On affiche d'abord l'avertissement d'anonymat puis on attend la
        // description. Aucun log du numéro sur ce chemin.
        this.sessions.update(sessionId, { state: 'ALERT_INPUT' });
        return { text: `CON ${t('alert_notice', lang)}\n${t('alert_prompt', lang)}` };
      case '5':
        // Retour au sélecteur de langue
        this.sessions.update(sessionId, { state: 'LANG_SELECT' });
        return { text: `CON ${t('language_select', lang)}` };
      default:
        return { text: `CON ${t('main_menu', lang)}` };
    }
  }

  /**
   * Flow "Vérifier mon NINA" — saisie + lookup identity + BINDING phone↔NINA.
   *
   * SÉCURITÉ (anti-énumération / fuite PII de masse — §4.5) :
   *   1. Rate-limit PAR NINA ciblé (anti-désanonymisation d'une personne).
   *   2. La fiche n'est révélée QUE si le numéro appelant == téléphone
   *      enregistré du citoyen ; sinon 2ᵉ facteur SMS (OTP au numéro officiel).
   *   3. TOUTE consultation est auditée (numéro haché, NINA masqué).
   *
   * FERMETURE DE L'ORACLE D'EXISTENCE (revue sécurité) : un appelant qui NE
   * contrôle PAS la ligne de la victime DOIT obtenir une réponse STRICTEMENT
   * IDENTIQUE que le NINA soit inconnu OU connu-mais-non-lié. On ne renvoie
   * donc plus `nina_not_found` ≠ `otp_sent` (qui distinguait les deux cas et
   * révélait l'existence) : les deux branches basculent vers le MÊME état
   * `VERIFY_NINA_OTP` avec le MÊME message neutre `otp_challenge`. L'OTP réel
   * n'est expédié QUE sur un vrai `phone_mismatch` (citoyen + numéro officiel
   * présents) et SOUS un quota d'envoi dédié (anti-amplification SMS). Comme
   * l'écran et l'état sont identiques, l'attaquant ne peut pas déduire « ce
   * NINA existe » de la réponse, et la vérification échouera de toute façon
   * sans OTP valide en mémoire.
   */
  private async handleVerifyNina(
    sessionId: string,
    phoneNumber: string,
    currentInput: string,
    lang: SupportedLanguage,
  ): Promise<UssdCallbackOutput> {
    const nina = currentInput.toUpperCase().trim();

    if (!NINA_REGEX.test(nina)) {
      return this.endSession(sessionId, t('invalid_nina', lang));
    }

    // Rate-limit PAR NINA ciblé : empêche un botnet de converger sur 1 NINA.
    if (this.rateLimit.isBlockedByNina(nina)) {
      this.audit.recordNinaLookup({
        result: 'rate_limited',
        ninaMasked: maskNina(nina),
        phone: phoneNumber,
      });
      return this.endSession(sessionId, t('rate_limited', lang));
    }

    const citizen = await this.identity.getByNina(nina);

    // ── Numéro appelant lié au NINA → divulgation directe de la fiche ───────
    // Seul cas qui produit une réponse OBSERVABLEMENT différente, et c'est sûr :
    // il EXIGE que l'appelant contrôle déjà la ligne officielle (preuve de
    // possession), donc il n'offre aucun oracle à un tiers.
    if (citizen && samePhone(phoneNumber, citizen.phoneNumber)) {
      this.audit.recordNinaLookup({
        result: 'success',
        ninaMasked: maskNina(nina),
        phone: phoneNumber,
        citizenId: citizen.id,
      });
      return this.endSession(
        sessionId,
        renderCitizen(nina, citizen.firstName, citizen.lastName, lang),
      );
    }

    // ── Sinon : RÉPONSE INDISTINGUABLE pour NINA inconnu ET numéro non lié ──
    // (fermeture de l'oracle d'existence). Audit avec le vrai résultat (le SOC
    // a besoin de distinguer `not_found` d'un `phone_mismatch` pour détecter
    // une campagne d'énumération), MAIS l'écran rendu est strictement le même.
    const realResult = citizen ? 'phone_mismatch' : 'not_found';
    this.audit.recordNinaLookup({
      result: realResult,
      ninaMasked: maskNina(nina),
      phone: phoneNumber,
    });

    // L'OTP n'est dispatché QUE sur un vrai mismatch (citoyen + numéro officiel
    // connus) ET sous un quota d'envoi dédié (1/fenêtre par NINA et par numéro
    // destinataire) → coupe l'amplification SMS / le harcèlement de la victime.
    // Sur `not_found` (ou numéro officiel absent / quota saturé), AUCUN SMS
    // n'est émis, mais l'utilisateur voit le MÊME écran (l'OTP saisi échouera
    // faute de défi en mémoire pour la session).
    if (citizen?.phoneNumber && this.rateLimit.allowOtpSend(nina, citizen.phoneNumber)) {
      this.smsOtp.challenge(sessionId, citizen.phoneNumber, nina);
    }

    // Bascule TOUJOURS vers le même état avec le même message neutre.
    this.sessions.update(sessionId, { state: 'VERIFY_NINA_OTP', data: { nina } });
    return { text: `CON ${t('otp_challenge', lang)}\n${t('enter_otp', lang)}` };
  }

  /**
   * 2ᵉ facteur SMS : l'utilisateur saisit l'OTP envoyé au numéro officiel.
   * Sur succès, la fiche est révélée (le caller a prouvé le contrôle de la
   * ligne officielle). Sur échec, message neutre, session détruite.
   */
  private async handleVerifyNinaOtp(
    sessionId: string,
    phoneNumber: string,
    currentInput: string,
    lang: SupportedLanguage,
    nina: string,
  ): Promise<UssdCallbackOutput> {
    if (!this.smsOtp.verify(sessionId, currentInput)) {
      this.audit.recordNinaLookup({
        result: 'phone_mismatch',
        ninaMasked: maskNina(nina),
        phone: phoneNumber,
      });
      return this.endSession(sessionId, t('otp_invalid', lang));
    }

    // OTP valide : le caller contrôle la ligne officielle → on révèle la fiche.
    const citizen = await this.identity.getByNina(nina);
    if (!citizen) {
      return this.endSession(sessionId, t('nina_not_found', lang));
    }
    this.audit.recordNinaLookup({
      result: 'success',
      ninaMasked: maskNina(nina),
      phone: phoneNumber,
      citizenId: citizen.id,
    });
    return this.endSession(
      sessionId,
      renderCitizen(nina, citizen.firstName, citizen.lastName, lang),
    );
  }

  /**
   * Flow "Signaler un problème" (SIGAC) — saisie de la description, ANONYME.
   *
   * PROTECTION DU LANCEUR D'ALERTE (§4.6.1) :
   *   - on NE LOGGE NI le numéro, NI le sessionId, NI l'IP sur ce chemin ;
   *   - le token de suivi dérive d'un secret aléatoire, JAMAIS du numéro ;
   *   - on NE TRANSMET aucun identifiant à SIGAC ;
   *   - on DÉTRUIT la session immédiatement (plus aucune trace en mémoire).
   */
  private handleAlertInput(
    sessionId: string,
    currentInput: string,
    lang: SupportedLanguage,
  ): UssdCallbackOutput {
    const description = currentInput.trim().slice(0, 160);
    if (description.length < 10) {
      // On garde la session ouverte pour redemander une description plus longue.
      return { text: `CON ${t('alert_too_short', lang)}\n${t('alert_prompt', lang)}` };
    }

    // Token de suivi : secret aléatoire pur. Le numéro N'EST PAS une entrée.
    const trackingToken = this.sigac.generateTrackingToken();
    this.sigac.submitAnonymous({ description, trackingToken, language: lang });

    // DESTRUCTION immédiate de la session : plus aucune trace reliant ce token
    // au numéro appelant. (endSession détruit aussi, mais on est explicite ici.)
    this.sessions.destroy(sessionId);

    // VOLONTAIREMENT aucun logger.info corrélable ici.
    const display = `${trackingToken.slice(0, 4)}-${trackingToken.slice(4)}`;
    const message = t('alert_received', lang).replace('{token}', display);
    // Tronque à la limite GSM puis préfixe END (sans re-détruire la session).
    const truncated = message.length > 178 ? `${message.slice(0, 175)}...` : message;
    return { text: `END ${truncated}` };
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

/**
 * Compare deux numéros E.164 après normalisation (espaces / tirets retirés).
 * On NE log JAMAIS les valeurs en clair (PII). `null` côté citoyen ⇒ jamais égal.
 */
function samePhone(caller: string, official: string | null): boolean {
  if (!official) return false;
  const norm = (p: string): string => p.replace(/[\s-]/g, '');
  return norm(caller) === norm(official);
}

/**
 * Rend la fiche citoyen pour l'écran USSD. MINIMISATION (THREAT-MODEL §4.7-I) :
 * on n'affiche que le NINA MASQUÉ + nom court — jamais le NINA brut ni la DDN.
 */
function renderCitizen(
  nina: string,
  firstName: string,
  lastName: string,
  lang: SupportedLanguage,
): string {
  const name = `${firstName} ${lastName}`.trim();
  return `${maskNina(nina)}\n${name}. ${t('goodbye', lang)}`;
}
