/**
 * @file        qr-signer.service.ts
 * @description Signe un payload JWT RS256 via Vault Transit. La clé privée
 *              ne quitte jamais Vault.
 *
 *              Flux :
 *                1. Lire `transit/keys/nina-qr-signing` → latest_version → kid
 *                2. Sérialiser header + payload base64url
 *                3. SHA-256 du signing_input → base64
 *                4. POST transit/sign/nina-qr-signing avec
 *                     prehashed=true, signature_algorithm=pkcs1v15
 *                5. Extraire la base64 signature, ré-encoder base64url
 *                6. Concaténer header.payload.signature → JWT final
 *
 * @module      document-service/qr
 */
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema';
import { VAULT_CLIENT } from '../vault/vault.module';
import type { QrPayload } from './qr-payload.interface';

/** Encode un Buffer ou une chaîne en base64url (sans padding). */
function b64url(buf: Buffer | string): string {
  return (typeof buf === 'string' ? Buffer.from(buf) : buf).toString('base64url');
}

@Injectable()
export class QrSignerService {
  private readonly keyName: string;

  constructor(
    cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient,
  ) {
    this.keyName = cfg.get('VAULT_QR_SIGNING_KEY', { infer: true });
  }

  /**
   * Signe un payload JWT et retourne le jeton complet + le kid utilisé.
   */
  async sign(payload: QrPayload): Promise<{ token: string; kid: string }> {
    // 1. Récupération de la version courante de la clé
    const meta = await this.vault.transitReadKey(this.keyName);
    const kid = `${this.keyName}-v${meta.latestVersion}`;

    // 2. Sérialisation header + payload
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const headerB64 = b64url(JSON.stringify(header));
    const payloadB64 = b64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // 3. Hash SHA-256 (prehashed=true côté Vault)
    const hashB64 = createHash('sha256').update(signingInput).digest('base64');

    // 4-5. Vault sign → "vault:vN:<base64sig>"
    const { signature } = await this.vault.transitSign(this.keyName, hashB64, {
      prehashed: true,
      signatureAlgorithm: 'pkcs1v15',
      hashAlgorithm: 'sha2-256',
    });
    const rawSig = Buffer.from(signature.split(':')[2]!, 'base64');
    const sigB64url = b64url(rawSig);

    // 6. JWT final
    return { token: `${signingInput}.${sigB64url}`, kid };
  }
}
