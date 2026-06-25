/**
 * @file        ussd.module.ts
 * @description Module USSD — controller + machine d'états + contrôles de
 *              sécurité P0 (doc 14 §4.2 → §4.6.1) :
 *                - AtAuthenticityGuard / DebugOnlyGuard (guards) ;
 *                - RateLimitStore (anti-énumération double dimension) ;
 *                - IdentityClient (lookup NINA pour le binding phone↔NINA) ;
 *                - AuditClient (audit des consultations, numéro haché) ;
 *                - SmsOtpClient (2ᵉ facteur du binding) ;
 *                - SigacClient (signalement anonyme).
 */

import { Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { UssdController } from './ussd.controller.js';
import { UssdService } from './ussd.service.js';
import { RateLimitStore } from './rate-limit.store.js';
import { IdentityClient } from './clients/identity.client.js';
import { AuditClient } from './clients/audit.client.js';
import { SmsOtpClient } from './clients/sms-otp.client.js';
import { SigacClient } from './clients/sigac.client.js';
import { AtAuthenticityGuard } from './guards/at-authenticity.guard.js';
import { DebugOnlyGuard } from './guards/debug-only.guard.js';

@Module({
  controllers: [UssdController],
  providers: [
    SessionService,
    UssdService,
    RateLimitStore,
    IdentityClient,
    AuditClient,
    SmsOtpClient,
    SigacClient,
    AtAuthenticityGuard,
    DebugOnlyGuard,
  ],
  exports: [UssdService],
})
export class UssdModule {}
