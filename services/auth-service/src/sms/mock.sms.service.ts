/**
 * @file        mock.sms.service.ts
 * @description Provider SMS de développement — n'envoie rien, logge le code
 *              en console au niveau `warn` pour le rendre visible dans la
 *              sortie du service.
 *
 *              Activé quand `MOCK_SMS=true` (défaut en dev). Empêche tout
 *              appel involontaire à Africa's Talking en local et économise
 *              les crédits sandbox.
 *
 * @module      auth-service/sms
 */

import { Injectable, Logger } from '@nestjs/common';

import type { SmsProvider } from './sms.types.js';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly providerName = 'mock';
  private readonly logger = new Logger(MockSmsProvider.name);

  send(to: string, message: string): Promise<void> {
    this.logger.warn(`[MOCK SMS → ${to}] ${message}`);
    return Promise.resolve();
  }
}
