/**
 * @file        crypto.module.ts
 * @description Module global exposant le `JwsSigner` (signature/vérif JWS RS256
 *              déléguée à Vault Transit). Importe `VaultModule` (client Vault).
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/crypto
 */
import { Global, Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module.js';
import { JwsSigner } from './jws.signer.js';

@Global()
@Module({
  imports: [VaultModule],
  providers: [JwsSigner],
  exports: [JwsSigner],
})
export class CryptoModule {}
