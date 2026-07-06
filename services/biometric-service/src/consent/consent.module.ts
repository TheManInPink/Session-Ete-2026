/**
 * @file        consent.module.ts
 * @description Module CONSENTEMENT biométrique : vérification JWS Ed25519 ancrée,
 *              persistance de la preuve, révocation → effacement. Exporte
 *              `ConsentService` (garde `assertActiveConsent`) consommé par le
 *              module enrollment.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/consent
 */
import { Module } from '@nestjs/common';
import { ConsentController } from './consent.controller.js';
import { ConsentService } from './consent.service.js';
import { ConsentVerifier } from './consent.verifier.js';
import { ConsentRepository } from './consent.repository.js';
import { CitizenKeyringService } from './citizen-keyring.service.js';

@Module({
  controllers: [ConsentController],
  providers: [ConsentService, ConsentVerifier, ConsentRepository, CitizenKeyringService],
  exports: [ConsentService, CitizenKeyringService],
})
export class ConsentModule {}
