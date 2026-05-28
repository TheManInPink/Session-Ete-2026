/**
 * @file        qr.module.ts
 * @description Wire des services QR : signer (Vault Transit), verifier
 *              (JWKS + hash + révocation), helpers.
 *
 * @module      document-service/qr
 */
import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { VaultModule } from '../vault/vault.module';
import { QrSignerService } from './qr-signer.service';
import { QrVerifierService } from './qr-verifier.service';
import { JwksService } from './jwks.service';
import { RevocationService } from './revocation.service';

@Module({
  imports: [RedisModule, VaultModule],
  providers: [QrSignerService, QrVerifierService, JwksService, RevocationService],
  exports: [QrSignerService, QrVerifierService, RevocationService],
})
export class QrModule {}
