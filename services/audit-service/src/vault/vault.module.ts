/**
 * @file        vault.module.ts
 * @description Module global instanciant un `VaultClient` (singleton) via DI pour
 *              charger la clé Ed25519 de scellement de racine. Token d'injection :
 *              `VAULT_CLIENT`.
 *
 *              🔒 DURCISSEMENT P1/P7 (ADR-034 / THREAT-MODEL #7) — authentification
 *              AppRole / Kubernetes ServiceAccount privilégiée (token TTL court,
 *              auto-renew par le client). Le mode `token` reste possible pour le
 *              dev local mais N'A PLUS de valeur par défaut codée en dur (cf. CANON
 *              sécurité / MEMORY : jamais de VAULT_TOKEN long-lived « baked-in »).
 *              Si `VAULT_AUTH_METHOD=token` sans `VAULT_TOKEN`, le boot échoue avec
 *              un message explicite. Pattern AS-BUILT recopié de
 *              `document-service/src/vault/vault.module.ts#buildAuthConfig`.
 *
 *              Comportement au boot selon l'environnement :
 *                - PRODUCTION  : login Vault OBLIGATOIRE — tout échec interrompt le
 *                  démarrage (fail-fast). Sceller avec une clé éphémère n'a aucune
 *                  valeur probante ; on refuse plutôt de démarrer (cf.
 *                  signing.service.ts §12, THREAT-MODEL #13).
 *                - DEV / TEST  : login best-effort — si Vault est injoignable, on
 *                  logge un warning et on renvoie tout de même le client (le
 *                  `SigningService` retombera sur une clé éphémère, DEV uniquement).
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

/**
 * Construit la configuration d'authentification Vault à partir de l'env, sans
 * jamais exiger ni journaliser de secret en clair. Pattern AS-BUILT aligné sur
 * `auth-service`/`document-service` (`buildAuthConfig`).
 *
 * @param cfg Service de configuration typé.
 * @throws Error si les variables requises par la méthode choisie sont absentes.
 */
function buildAuthConfig(
  cfg: ConfigService<Env, true>,
): ConstructorParameters<typeof VaultClient>[0]['auth'] {
  const method = cfg.get('VAULT_AUTH_METHOD', { infer: true });

  if (method === 'approle') {
    const roleId = cfg.get('VAULT_APPROLE_ROLE_ID', { infer: true });
    const secretId = cfg.get('VAULT_APPROLE_SECRET_ID', { infer: true });
    if (!roleId || !secretId) {
      throw new Error(
        'VAULT_AUTH_METHOD=approle nécessite VAULT_APPROLE_ROLE_ID et VAULT_APPROLE_SECRET_ID',
      );
    }
    return { method: 'approle', roleId, secretId };
  }

  if (method === 'kubernetes') {
    const role = cfg.get('VAULT_KUBERNETES_ROLE', { infer: true });
    if (!role) throw new Error('VAULT_AUTH_METHOD=kubernetes nécessite VAULT_KUBERNETES_ROLE');
    return { method: 'kubernetes', role };
  }

  // method === 'token' — dev local uniquement, pas de défaut codé en dur.
  const token = cfg.get('VAULT_TOKEN', { infer: true });
  if (!token) throw new Error('VAULT_AUTH_METHOD=token nécessite VAULT_TOKEN (dev local)');
  return { method: 'token', token };
}

@Global()
@Module({
  providers: [
    {
      provide: VAULT_CLIENT,
      useFactory: async (cfg: ConfigService<Env, true>) => {
        const logger = new Logger('VaultModule');
        const method = cfg.get('VAULT_AUTH_METHOD', { infer: true });
        const isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
        const client = new VaultClient({
          endpoint: cfg.get('VAULT_ADDR', { infer: true }),
          auth: buildAuthConfig(cfg),
          logLevel: 'warn',
        });
        try {
          await client.login();
          logger.log(`Vault authentifié (méthode=${method})`);
        } catch (err) {
          // FAIL-FAST en production : sans Vault, le scellement tomberait sur une
          // clé éphémère invérifiable après restart → on refuse de démarrer.
          if (isProd) {
            throw new Error(
              `Vault injoignable au boot en production (${(err as Error).message}). ` +
                `Auth AppRole/K8s requise pour le scellement audit. Refus de démarrer.`,
              { cause: err },
            );
          }
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
