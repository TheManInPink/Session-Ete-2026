/**
 * @file        vault.module.ts
 * @description Module global instanciant un `VaultClient` (singleton) via DI pour
 *              la signature JWS RS256 (SGOGT + export DGE) et le HMAC du
 *              pseudonyme électoral — toutes déléguées à Vault Transit (clés non
 *              exportables). Token d'injection : `VAULT_CLIENT`.
 *
 *              🔒 DURCISSEMENT (ADR-034) — authentification AppRole / Kubernetes
 *              privilégiée (token TTL court, auto-renew). Le mode `token` reste
 *              possible pour le dev local mais N'A PLUS de valeur par défaut
 *              codée en dur. Pattern AS-BUILT recopié de
 *              `audit-service/src/vault/vault.module.ts`.
 *
 *              Comportement au boot selon l'environnement :
 *                - PRODUCTION : login Vault OBLIGATOIRE — tout échec interrompt
 *                  le démarrage (fail-fast). Sans clé de signature, les messages
 *                  SGOGT ne seraient pas non-répudiables et l'export DGE ne
 *                  serait pas authentifiable (brief §5).
 *                - DEV / TEST : login best-effort — si Vault est injoignable, on
 *                  logge un warning ; le `JwsSigner` retombe sur une clé locale
 *                  éphémère (DEV uniquement, jamais en production).
 *
 *              Désactivable explicitement via `GOVERNANCE_VAULT_ENABLED=false`
 *              (test/CI) : aucun login n'est tenté.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/vault
 */
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';

/** Token DI pour le client Vault (peut être `null` si Vault désactivé). */
export const VAULT_CLIENT = 'VAULT_CLIENT';

/**
 * Construit la configuration d'authentification Vault à partir de l'env, sans
 * jamais exiger ni journaliser de secret en clair.
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
      useFactory: async (cfg: ConfigService<Env, true>): Promise<VaultClient | null> => {
        const logger = new Logger('VaultModule');
        const enabled = cfg.get('GOVERNANCE_VAULT_ENABLED', { infer: true });
        const isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';

        if (!enabled) {
          if (isProd) {
            throw new Error(
              'GOVERNANCE_VAULT_ENABLED=false interdit en production : la signature ' +
                'JWS (non-répudiation SGOGT/export DGE) exige Vault Transit. Refus de démarrer.',
            );
          }
          logger.warn('Vault désactivé (GOVERNANCE_VAULT_ENABLED=false) — mode DEV éphémère.');
          return null;
        }

        const method = cfg.get('VAULT_AUTH_METHOD', { infer: true });
        const client = new VaultClient({
          endpoint: cfg.get('VAULT_ADDR', { infer: true }),
          auth: buildAuthConfig(cfg),
          logLevel: 'warn',
        });
        try {
          await client.login();
          logger.log(`Vault authentifié (méthode=${method})`);
        } catch (err) {
          // FAIL-FAST en production : sans Vault, la signature JWS est impossible
          // → messages non non-répudiables / export non authentifiable.
          if (isProd) {
            throw new Error(
              `Vault injoignable au boot en production (${(err as Error).message}). ` +
                'Auth AppRole/K8s requise pour la signature SGOGT/export DGE. Refus de démarrer.',
              { cause: err },
            );
          }
          logger.warn(
            `Vault injoignable au boot : ${(err as Error).message} — ` +
              'la signature utilisera une clé éphémère en dev.',
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
