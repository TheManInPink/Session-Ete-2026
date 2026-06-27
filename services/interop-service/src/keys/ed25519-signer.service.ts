/**
 * @file        ed25519-signer.service.ts
 * @description Signature JWS Ed25519 (EdDSA) IN-PROCESS — modèle de clé tranché
 *              (doc 21 §4.2ter / ADR-021).
 *
 *              🧭 DÉCISION DE CLÉ (canon ADR-026/034) : Vault **Transit ne
 *              supporte PAS Ed25519** pour la signature. On NE PEUT donc PAS
 *              signer « dans Vault » via `transit/sign`. On signe IN-PROCESS
 *              avec `jose` (alg EdDSA), la clé privée étant chargée depuis un
 *              secret **Vault KV** à durée de vie courte (lease), jamais codée en
 *              dur, jamais un `VAULT_TOKEN` long-lived. Rotation = nouveau secret
 *              KV + nouveau `kid`. L'alternative « clé jamais en RAM » exigerait
 *              de changer d'algo (RS256 Transit), ce que le protocole BCID-AES
 *              interdit (pairs en Ed25519).
 *
 *              🔒 FAIL-FAST PRODUCTION : en `NODE_ENV=production`, si la clé
 *              Vault est indisponible (Vault down / secret absent), le service
 *              REFUSE de démarrer — signer avec une clé éphémère produirait des
 *              JWS que les partenaires ne pourraient pas vérifier après restart.
 *              En dev/test uniquement, une clé ÉPHÉMÈRE est tolérée (warning).
 *
 *              Forme du secret KV attendu (l'un OU l'autre suffit) :
 *                { private_jwk: { kty:'OKP', crv:'Ed25519', d, x }, kid? }
 *                { private_key_hex: <32 octets seed>, public_key_hex, kid? }
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      interop-service/keys
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ed from '@noble/ed25519';
import { SignJWT, importJWK, type CryptoKey, type JWK } from 'jose';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { JWS_ALG } from '../bcid/bcid.constants.js';
import { VAULT_CLIENT } from '../vault/vault.tokens.js';

/** Forme du secret KV attendu dans Vault (deux variantes acceptées). */
interface InteropSigningKeySecret extends Record<string, unknown> {
  private_jwk?: JWK;
  private_key_hex?: string;
  public_key_hex?: string;
  kid?: string;
}

/** Recopie un `Uint8Array` dans un buffer « propre » pour `@noble/ed25519`. */
function bytes(u: Uint8Array): Uint8Array {
  return new Uint8Array(u);
}

/** Encode des octets en base64url (sans padding) — format des champs JWK OKP. */
function b64url(u: Uint8Array): string {
  return Buffer.from(u).toString('base64url');
}

@Injectable()
export class Ed25519SignerService implements OnModuleInit {
  private readonly logger = new Logger(Ed25519SignerService.name);
  private privateKey: CryptoKey | null = null;
  private kid: string;

  constructor(
    private readonly cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient,
  ) {
    this.kid = cfg.get('INTEROP_SIGNING_KID', { infer: true });
  }

  /** Charge la clé au démarrage (Vault KV → sinon clé éphémère DEV). */
  async onModuleInit(): Promise<void> {
    await this.loadKey();
  }

  /**
   * Charge la clé privée Ed25519 depuis Vault KV et l'importe en `CryptoKey`
   * exploitable par `jose`.
   *
   * @throws Error en production si la clé Vault est indisponible.
   */
  private async loadKey(): Promise<void> {
    const path = this.cfg.get('VAULT_INTEROP_KEY_PATH', { infer: true });
    try {
      const secret = await this.vault.getSecret<InteropSigningKeySecret>(path);
      const jwk = this.toPrivateJwk(secret);
      this.privateKey = (await importJWK(jwk, JWS_ALG)) as CryptoKey;
      if (secret.kid) this.kid = secret.kid;
      this.logger.log(`Clé Ed25519 JWS chargée depuis Vault KV (kid=${this.kid})`);
    } catch (err) {
      if (this.cfg.get('NODE_ENV', { infer: true }) === 'production') {
        throw new Error(
          `Clé de signature JWS BCID-AES indisponible en production (${(err as Error).message}). ` +
            `Bootstrap Vault requis (AppRole/K8s, chemin '${path}'). Refus de démarrer.`,
          { cause: err },
        );
      }
      this.logger.warn(
        `Clé Vault indisponible (${(err as Error).message}) — génération d'une clé Ed25519 éphémère (DEV uniquement).`,
      );
      await this.loadEphemeralKey();
    }
  }

  /** Construit un JWK Ed25519 privé à partir du secret KV (JWK direct ou seed hex). */
  private toPrivateJwk(secret: InteropSigningKeySecret): JWK {
    if (secret.private_jwk) return secret.private_jwk;
    if (secret.private_key_hex) {
      const seed = bytes(Buffer.from(secret.private_key_hex, 'hex'));
      const pub = secret.public_key_hex
        ? bytes(Buffer.from(secret.public_key_hex, 'hex'))
        : ed.getPublicKey(seed);
      return { kty: 'OKP', crv: 'Ed25519', d: b64url(seed), x: b64url(pub) };
    }
    throw new Error('secret KV incomplet (private_jwk ou private_key_hex manquant)');
  }

  /** Génère une paire Ed25519 éphémère et l'importe (DEV / TEST uniquement). */
  private async loadEphemeralKey(): Promise<void> {
    const seed = bytes(ed.utils.randomPrivateKey());
    const pub = await ed.getPublicKeyAsync(seed);
    const jwk: JWK = { kty: 'OKP', crv: 'Ed25519', d: b64url(seed), x: b64url(pub) };
    this.privateKey = (await importJWK(jwk, JWS_ALG)) as CryptoKey;
    this.kid = 'ephemeral-dev';
  }

  /** `kid` courant (header JWS) — change après rotation Vault. */
  getKid(): string {
    return this.kid;
  }

  /**
   * Signe un payload en JWS compact Ed25519 avec les claims protégés exigés par
   * BCID-AES (jti/iat/nbf/iss/aud/exp). `alg` est FIGÉ à EdDSA.
   *
   * @param payload  Claims applicatifs (réponse verify-nina minimaliste).
   * @param opts.jti `jti` unique du JWS de réponse.
   * @param opts.iss Émetteur (`iss`) — pays de CE nœud.
   * @param opts.aud Audience (`aud`) — `aes:<paysPair>`.
   * @param opts.ttl Durée de vie (jose duration, ex. `5m`).
   * @returns Le JWS compact (3 segments base64url séparés par des points).
   */
  async sign(
    payload: Record<string, unknown>,
    opts: { jti: string; iss: string; aud: string; ttl: string },
  ): Promise<string> {
    if (!this.privateKey) await this.loadKey();
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: JWS_ALG, typ: 'JWT', kid: this.kid })
      .setJti(opts.jti)
      .setIssuedAt()
      .setNotBefore('0s')
      .setIssuer(opts.iss)
      .setAudience(opts.aud)
      .setExpirationTime(opts.ttl)
      .sign(this.privateKey!);
  }
}
