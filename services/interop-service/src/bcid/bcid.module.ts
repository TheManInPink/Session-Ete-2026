/**
 * @file        bcid.module.ts
 * @description Module métier BCID-AES : assemble la dérivation du pair mTLS, la
 *              vérification/signature JWS Ed25519, l'anti-replay, le rate-limit
 *              fail-closed, le client sortant, la persistance et les contrôleurs
 *              (entrant `verify` + admin/sortant).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/bcid
 */
import { Module } from '@nestjs/common';
import { VerifyNinaController } from './verify-nina.controller.js';
import { InteropAdminController } from './interop-admin.controller.js';
import { VerifyNinaService } from './verify-nina.service.js';
import { InteropClientService } from './interop-client.service.js';
import { JwsService } from './jws.service.js';
import { PartnerRepository } from './partner.repository.js';
import { DerivePeerService } from '../peer/derive-peer.service.js';
import { AntiReplayService } from '../replay/anti-replay.service.js';
import { AesRateLimitService } from '../throttle/aes-rate-limit.service.js';
import { Ed25519SignerService } from '../keys/ed25519-signer.service.js';

@Module({
  controllers: [VerifyNinaController, InteropAdminController],
  providers: [
    DerivePeerService,
    JwsService,
    AntiReplayService,
    AesRateLimitService,
    Ed25519SignerService,
    PartnerRepository,
    VerifyNinaService,
    InteropClientService,
  ],
  exports: [VerifyNinaService, InteropClientService],
})
export class BcidModule {}
