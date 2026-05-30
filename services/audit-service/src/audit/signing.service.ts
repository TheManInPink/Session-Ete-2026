/**
 * @file        signing.service.ts
 * @description Service de signature Ed25519 des racines de chaîne (ancrage
 *              temporel, cf. doc 09 §12).
 *
 *              La clé privée Ed25519 est stockée dans Vault (KV v2, chemin
 *              `VAULT_AUDIT_KEY_PATH`) sous la forme :
 *                { private_key_hex, public_key_hex, key_id }
 *
 *              Souveraineté : la clé est chargée en mémoire au boot, jamais
 *              codée en dur. En l'absence de Vault (dev sans bootstrap), une
 *              clé ÉPHÉMÈRE est générée + un warning loggé — le service reste
 *              fonctionnel mais les signatures ne survivent pas au restart
 *              (cf. `pnpm vault:bootstrap` pour persister une vraie clé).
 *
 *              Algo Ed25519 (`@noble/ed25519`, JS pur, audité) : signatures de
 *              64 octets, vérification rapide, réutilisable dans le script
 *              offline et, plus tard, côté mobile.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';

/** Forme du secret KV attendu dans Vault. */
interface AuditSigningKeySecret extends Record<string, unknown> {
  private_key_hex: string;
  public_key_hex: string;
  key_id?: string;
}

/**
 * Recopie un `Uint8Array` dans un buffer « propre » (typé `Uint8Array<ArrayBuffer>`)
 * pour satisfaire le typage strict de `@noble/ed25519` (qui n'accepte pas les
 * `Uint8Array<ArrayBufferLike>` issus de `Buffer`/`TextEncoder`).
 */
function bytes(u: Uint8Array): Uint8Array {
  return new Uint8Array(u);
}

@Injectable()
export class SigningService implements OnModuleInit {
  private readonly logger = new Logger(SigningService.name);
  private privateKey: Uint8Array | null = null;
  private publicKeyHex = '';
  private keyId = 'unset';

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient,
  ) {}

  /** Charge la clé au démarrage (Vault → sinon clé éphémère de secours). */
  async onModuleInit(): Promise<void> {
    await this.loadKey();
  }

  /**
   * Tente de charger la clé Ed25519 depuis Vault. En cas d'échec (Vault down,
   * secret absent), génère une clé éphémère pour ne pas bloquer le service.
   */
  private async loadKey(): Promise<void> {
    const path = this.cfg.get('VAULT_AUDIT_KEY_PATH', { infer: true });
    try {
      const secret = await this.vault.getSecret<AuditSigningKeySecret>(path);
      if (!secret?.private_key_hex || !secret?.public_key_hex) {
        throw new Error('secret incomplet (private_key_hex / public_key_hex manquant)');
      }
      this.privateKey = bytes(Buffer.from(secret.private_key_hex, 'hex'));
      this.publicKeyHex = secret.public_key_hex;
      this.keyId = secret.key_id ?? 'vault-ed25519';
      this.logger.log(`Clé Ed25519 chargée depuis Vault (keyId=${this.keyId})`);
    } catch (err) {
      this.logger.warn(
        `Clé Vault indisponible (${(err as Error).message}) — génération d'une clé éphémère (DEV uniquement).`,
      );
      const priv = bytes(ed.utils.randomPrivateKey());
      const pub = await ed.getPublicKeyAsync(priv);
      this.privateKey = priv;
      this.publicKeyHex = Buffer.from(pub).toString('hex');
      this.keyId = 'ephemeral-dev';
    }
  }

  /**
   * Signe un message UTF-8 et retourne la signature hexadécimale (128 chars).
   *
   * @param message Message à signer (typiquement `chainRootHash|signedAt`).
   */
  async sign(message: string): Promise<string> {
    if (!this.privateKey) await this.loadKey();
    const sig = await ed.signAsync(
      bytes(new TextEncoder().encode(message)),
      bytes(this.privateKey!),
    );
    return Buffer.from(sig).toString('hex');
  }

  /**
   * Vérifie une signature hexadécimale contre la clé publique courante.
   *
   * @param message  Message original.
   * @param sigHex   Signature hexadécimale.
   */
  async verify(message: string, sigHex: string): Promise<boolean> {
    if (!this.publicKeyHex) return false;
    try {
      return await ed.verifyAsync(
        bytes(Buffer.from(sigHex, 'hex')),
        bytes(new TextEncoder().encode(message)),
        bytes(Buffer.from(this.publicKeyHex, 'hex')),
      );
    } catch {
      return false;
    }
  }

  /** Clé publique Ed25519 hexadécimale (à publier pour vérif offline). */
  getPublicKeyHex(): string {
    return this.publicKeyHex;
  }

  /** Identifiant de la clé de signature (rotation Vault). */
  getKeyId(): string {
    return this.keyId;
  }
}
