/**
 * @file        vault.module.ts
 * @description Fournit un `VaultClient` (singleton) via DI pour charger la clé
 *              Ed25519 de scellement de racine. Token d'injection :
 *              `VAULT_CLIENT`.
 *
 *              Tolérant aux pannes : si Vault est injoignable au démarrage, on
 *              logge un warning et on renvoie tout de même le client (le
 *              `SigningService` retombera sur une clé éphémère en dev). On ne
 *              veut JAMAIS empêcher l'ingestion d'audit parce que le scellement
 *              horaire est indisponible.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/vault
 */
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';

/** Token DI pour le client Vault. */
export const VAULT_CLIENT = 'VAULT_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: VAULT_CLIENT,
      useFactory: async (cfg: ConfigService<Env, true>) => {
        const logger = new Logger('VaultModule');
        const client = new VaultClient({
          endpoint: cfg.get('VAULT_ADDR', { infer: true }),
          auth: { method: 'token', token: cfg.get('VAULT_TOKEN', { infer: true }) },
        });
        try {
          await client.login();
          logger.log('Vault authentifié (token)');
        } catch (err) {
          logger.warn(
            `Vault injoignable au boot : ${(err as Error).message} — le scellement utilisera une clé éphémère en dev.`,
          );
        }
        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [VAULT_CLIENT],
})
export class VaultModule {}
