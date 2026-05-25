/**
 * @file        crypto.module.ts
 * @description Module global regroupant les services cryptographiques :
 *                - {@link ArgonService}      — hash Argon2id mots de passe
 *                - {@link JwtCryptoService}  — sign/verify JWT RS256 (Vault)
 *
 *              Dépend implicitement de {@link VaultModule} (chargé globalement
 *              en amont dans `AppModule`).
 *
 * @module      auth-service/crypto
 */

import { Global, Module } from '@nestjs/common';

import { ArgonService } from './argon.service.js';
import { JwtCryptoService } from './jwt.service.js';

@Global()
@Module({
  providers: [ArgonService, JwtCryptoService],
  exports: [ArgonService, JwtCryptoService],
})
export class CryptoModule {}
