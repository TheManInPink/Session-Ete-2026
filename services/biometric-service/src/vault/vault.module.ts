/**
 * @file        vault.module.ts
 * @description Module global instanciant un `VaultClient` (singleton) via DI pour
 *              lire le PARAMÈTRE CANCELABLE (« sel » de projection ISO/IEC 24745,
 *              distance-préservant) — secret RÉVOCABLE/EXPORTABLE versionné par
 *              `kid` (cf. INCIDENT-PROTOCOL §1.3). Token d'injection : `VAULT_CLIENT`.
 *
 *              🔒 CANON crypto — le paramètre cancelable n'est NI un HMAC (rejeté
 *              doc 25 §0.2), NI une clé Ed25519 (Vault Transit ne supporte pas
 *              Ed25519), NI une clé de chiffrement asymétrique : c'est un secret de
 *              PROJECTION ALÉATOIRE. Le service le LIT/EXPORTE de Vault puis calcule
 *              la projection CÔTÉ SERVICE (pas une opération HMAC in-Vault).
 *
 *              🔒 DURCISSEMENT (ADR-034) — authentification AppRole / Kubernetes
 *              privilégiée (token TTL court, auto-renew). Pattern AS-BUILT recopié
 *              de `governance-service` / `audit-service`.
 *
 *              Comportement au boot selon l'environnement :
 *                - PRODUCTION : login Vault OBLIGATOIRE — tout échec interrompt le
 *                  démarrage (fail-fast). Sans le paramètre cancelable, on ne peut
 *                  ni enrôler ni vérifier (la protection de template est impossible).
 *                - DEV / TEST : login best-effort — si Vault est injoignable, on
 *                  logge un warning ; `CancelableService` retombe sur un paramètre
 *                  cancelable ÉPHÉMÈRE déterministe (DEV uniquement, jamais en prod).
 *
 *              Désactivable explicitement via `BIOMETRIC_VAULT_ENABLED=false`
 *              (test/CI) : aucun login n'est tenté.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/vault
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
        const enabled = cfg.get('BIOMETRIC_VAULT_ENABLED', { infer: true });
        const isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';

        if (!enabled) {
          if (isProd) {
            throw new Error(
              'BIOMETRIC_VAULT_ENABLED=false interdit en production : la protection de ' +
                'template cancelable exige le paramètre Vault. Refus de démarrer.',
            );
          }
          logger.warn('Vault désactivé (BIOMETRIC_VAULT_ENABLED=false) — paramètre DEV éphémère.');
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
          // FAIL-FAST en production : sans le paramètre cancelable, ni enrôlement
          // ni vérification ne sont possibles (protection de template impossible).
          if (isProd) {
            throw new Error(
              `Vault injoignable au boot en production (${(err as Error).message}). ` +
                'Auth AppRole/K8s requise pour le paramètre cancelable. Refus de démarrer.',
              { cause: err },
            );
          }
          logger.warn(
            `Vault injoignable au boot : ${(err as Error).message} — ` +
              'paramètre cancelable éphémère en dev.',
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
