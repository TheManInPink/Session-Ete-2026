/**
 * @file        vault.module.ts
 * @description Module global exposant `VaultService` à tout le service.
 *              Marqué `@Global` car la majorité des modules en dépendent
 *              (jwt-crypto, transit-sign, etc.).
 *
 * @module      auth-service/vault
 */

import { Global, Module } from '@nestjs/common';

import { VaultService } from './vault.service.js';

@Global()
@Module({
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
