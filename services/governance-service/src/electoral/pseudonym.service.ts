/**
 * @file        pseudonym.service.ts
 * @description Pseudonymisation électorale (Bloc C3). Génère le `pseudonymousId`
 *              via **HMAC-SHA256 calculé DANS Vault** (engine Transit, endpoint
 *              `transit/hmac/<key>`), avec une clé HMAC NON exportable.
 *
 *              POURQUOI un HMAC Vault et PAS `SHA-256(NINA + sel)` :
 *                - le NINA a un FORMAT PUBLIC → l'espace des entrées est petit ;
 *                  un `SHA-256(NINA+sel)` local serait BRUTEFORÇABLE si le sel
 *                  fuyait (un admin DB suffirait à ré-identifier l'électorat) ;
 *                - avec `transit/hmac`, la clé est générée/conservée par Vault,
 *                  NON exportable : même admin DB + code source ne peuvent PAS
 *                  recalculer les pseudonymes hors de Vault. C'est la SEULE
 *                  valeur secrète du dispositif.
 *                - `saltVersion` n'est PAS un sel secret : c'est un TAG DE
 *                  SÉPARATION DE DOMAINE PUBLIC (rotation sans casser l'historique).
 *
 *              🔒 FAIL-FAST PRODUCTION : sans client Vault, l'HMAC Vault est
 *              impossible — en production on REFUSE de générer un pseudonyme (pas
 *              de repli local bruteforçable). En DEV uniquement, un HMAC local
 *              déterministe (clé éphémère mémoire) est toléré pour les tests.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/electoral
 */
import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';

@Injectable()
export class PseudonymService {
  private readonly logger = new Logger(PseudonymService.name);
  private readonly hmacKey: string;
  private readonly saltVersion: number;
  private readonly isProd: boolean;
  /** Clé HMAC locale ÉPHÉMÈRE (DEV uniquement, jamais en prod). */
  private readonly devHmacKey = randomBytes(32);

  constructor(
    cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient | null,
  ) {
    this.hmacKey = cfg.get('VAULT_ELECTIONS_HMAC_KEY', { infer: true });
    this.saltVersion = cfg.get('ELECTIONS_SALT_VERSION', { infer: true });
    this.isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Version de contexte HMAC active (tag PUBLIC de séparation de domaine). */
  currentSaltVersion(): number {
    return this.saltVersion;
  }

  /**
   * Génère le `pseudonymousId` STABLE et NON-RÉVERSIBLE hors de Vault.
   *
   * @param nina        NINA du citoyen (jamais journalisé ni exporté).
   * @param saltVersion Tag de séparation de domaine PUBLIC (préfixe d'entrée).
   * @returns Pseudonyme (base64, sans préfixe `vault:vN:`).
   * @throws InternalServerErrorException si Vault est absent en production.
   */
  async generate(nina: string, saltVersion: number = this.saltVersion): Promise<string> {
    // `v<saltVersion>:` = préfixe de séparation de domaine PUBLIC (pas un secret).
    const input = Buffer.from(`v${saltVersion}:${nina}`, 'utf8').toString('base64');

    if (this.vault) {
      try {
        const vaultHmac = await this.vault.transitHmac(this.hmacKey, input, {
          algorithm: 'sha2-256',
        });
        return vaultHmac.replace(/^vault:v\d+:/, '');
      } catch (err) {
        this.logger.error(`HMAC Vault échoué (${this.hmacKey}) : ${(err as Error).message}`);
        throw new InternalServerErrorException('PSEUDONYM_UNAVAILABLE');
      }
    }

    // Pas de Vault. En production : refus (pas de repli bruteforçable).
    if (this.isProd) {
      this.logger.error('Pseudonymisation impossible : Vault absent en production (fail-fast).');
      throw new InternalServerErrorException('PSEUDONYM_UNAVAILABLE');
    }

    // DEV uniquement : HMAC local déterministe (clé éphémère mémoire).
    return createHmac('sha256', this.devHmacKey)
      .update(Buffer.from(input, 'base64'))
      .digest('base64');
  }
}
