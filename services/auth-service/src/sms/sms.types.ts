/**
 * @file        sms.types.ts
 * @description Contrat d'un fournisseur SMS et token d'injection.
 *
 *              Deux implémentations dans ce service :
 *                - {@link MockSmsProvider}           (par défaut en dev)
 *                - {@link AfricasTalkingSmsProvider} (sandbox / prod)
 *
 * @module      auth-service/sms
 */

/** Contrat minimal d'un fournisseur SMS sortant. */
export interface SmsProvider {
  /**
   * Envoie un SMS. Le numéro doit être au format E.164 (`+223...`).
   * @throws si l'envoi échoue (le service appelant décide du fallback).
   */
  send(to: string, message: string): Promise<void>;

  /** Identifiant lisible du provider (pour les logs / health-check). */
  readonly providerName: string;
}

/** Token d'injection NestJS pour le provider. */
export const SMS_PROVIDER = Symbol('NINA_AES_SMS_PROVIDER');
