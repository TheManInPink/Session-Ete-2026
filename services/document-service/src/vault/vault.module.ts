/**
 * @file        vault.module.ts
 * @description Module global instanciant {@link VaultClient}.
 *
 *              🔒 DURCISSEMENT P1 — authentification AppRole / Kubernetes SA
 *              privilégiée (token TTL court, auto-renew par le client). Le mode
 *              `token` reste possible pour le dev local mais N'A PLUS de valeur
 *              par défaut codée en dur (cf. CANON sécurité / MEMORY : jamais de
 *              VAULT_TOKEN long-lived « baked-in »). Si `VAULT_AUTH_METHOD=token`
 *              sans `VAULT_TOKEN`, le boot échoue avec un message explicite.
 *
 *              Login au boot (bloque le démarrage tant que Vault n'est pas
 *              joignable), exposé pour la signature QR (Vault Transit).
 *
 * @module      document-service/vault
 */
import { Global, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema';

export const VAULT_CLIENT = Symbol('VAULT_CLIENT');

/**
 * Construit la configuration d'authentification Vault à partir de l'env,
 * sans jamais exiger ni journaliser de secret en clair. Pattern AS-BUILT
 * aligné sur `auth-service/src/vault/vault.service.ts#buildAuthConfig`.
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
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService<Env, true>): Promise<VaultClient> => {
        const method = cfg.get('VAULT_AUTH_METHOD', { infer: true });
        const client = new VaultClient({
          endpoint: cfg.get('VAULT_ADDR', { infer: true })!,
          auth: buildAuthConfig(cfg),
          logLevel: 'warn',
        });
        await client.login();
        new Logger('VaultModule').log(`Vault login OK (méthode=${method})`);
        return client;
      },
    },
  ],
  exports: [VAULT_CLIENT],
})
export class VaultModule implements OnModuleDestroy {
  onModuleDestroy(): void {
    // VaultClient n'expose pas de close() ici (instancié en factory) — le timer
    // auto-renew est annulé via process exit / destroy() côté client.
  }
}
