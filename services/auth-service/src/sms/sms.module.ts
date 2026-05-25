/**
 * @file        sms.module.ts
 * @description Module global SMS. Sélectionne dynamiquement le provider
 *              selon `MOCK_SMS` au boot — pas de switch runtime, le mode
 *              est figé pour la durée du process (évite les surprises).
 *
 *              Exporte uniquement le token `SMS_PROVIDER` ; les consommateurs
 *              injectent l'interface, pas l'implémentation concrète.
 *
 * @module      auth-service/sms
 */

import { Global, Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnv } from '../config/env.config.js';

import { AfricasTalkingSmsProvider } from './africas-talking.sms.service.js';
import { MockSmsProvider } from './mock.sms.service.js';
import { SMS_PROVIDER, type SmsProvider } from './sms.types.js';

const smsProvider: Provider = {
  provide: SMS_PROVIDER,
  useFactory: (
    config: ConfigService<AppEnv, true>,
    mock: MockSmsProvider,
    real: AfricasTalkingSmsProvider,
  ): SmsProvider => {
    const useMock = config.get('MOCK_SMS', { infer: true });
    const logger = new Logger('SmsModule');
    logger.log(`Provider SMS sélectionné : ${useMock ? mock.providerName : real.providerName}`);
    return useMock ? mock : real;
  },
  inject: [ConfigService, MockSmsProvider, AfricasTalkingSmsProvider],
};

@Global()
@Module({
  providers: [MockSmsProvider, AfricasTalkingSmsProvider, smsProvider],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
