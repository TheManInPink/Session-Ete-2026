/**
 * @file        africas-talking.sms.service.ts
 * @description Provider SMS basé sur l'API Africa's Talking.
 *
 *              Utilisé en sandbox / staging / prod. Les credentials sont
 *              fournis via env (`AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`).
 *
 *              Le SDK officiel `africastalking` n'a pas de types officiels —
 *              on tape la surface utilisée localement plutôt que d'ajouter
 *              un `@types/africastalking` inexistant.
 *
 * @module      auth-service/sms
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AfricasTalkingSdk } from 'africastalking';

import type { AppEnv } from '../config/env.config.js';

import type { SmsProvider } from './sms.types.js';

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly providerName = 'africas-talking';
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);
  private sdk: AfricasTalkingSdk | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async send(to: string, message: string): Promise<void> {
    const sdk = await this.getSdk();
    const senderId = this.config.get('AT_SENDER_ID', { infer: true });

    try {
      const res = await sdk.SMS.send({ to, message, from: senderId });
      const status = res.SMSMessageData.Recipients[0]?.status;
      if (status && status !== 'Success' && status !== 'Sent') {
        throw new Error(`Africa's Talking status: ${status}`);
      }
    } catch (err) {
      this.logger.error(`Envoi SMS à ${to} échoué`, err as Error);
      throw new ServiceUnavailableException('SMS_PROVIDER_UNAVAILABLE');
    }
  }

  /** Lazy-load — n'instancie le SDK qu'au premier appel pour ne pas pénaliser le boot. */
  private async getSdk(): Promise<AfricasTalkingSdk> {
    if (this.sdk) return this.sdk;

    const apiKey = this.config.get('AT_API_KEY', { infer: true });
    const username = this.config.get('AT_USERNAME', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AT_API_KEY non défini — passer MOCK_SMS=true en dev ou fournir un AT_API_KEY valide.',
      );
    }

    // Import dynamique — évite que les tests / `MOCK_SMS=true` paient le coût.
    const mod = await import('africastalking');
    const factory = mod.default;
    this.sdk = factory({ apiKey, username });
    return this.sdk;
  }
}
