/**
 * @file        vault.module.ts
 * @description Module global instanciant {@link VaultClient} (auth token-only
 *              en P0). Login au boot, exposé pour signature QR (phase 4).
 * @module      document-service/vault
 */
import { Global, Logger, Module, OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema';

export const VAULT_CLIENT = Symbol('VAULT_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: VAULT_CLIENT,
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService<Env, true>): Promise<VaultClient> => {
        const client = new VaultClient({
          endpoint: cfg.get('VAULT_ADDR', { infer: true })!,
          auth: { method: 'token', token: cfg.get('VAULT_TOKEN', { infer: true })! },
          logLevel: 'warn',
        });
        await client.login();
        new Logger('VaultModule').log('Vault login OK');
        return client;
      },
    },
  ],
  exports: [VAULT_CLIENT],
})
export class VaultModule implements OnModuleInit, OnModuleDestroy {
  onModuleInit(): void {
    // login fait dans la factory pour bloquer le boot tant que Vault n'est pas joignable
  }
  onModuleDestroy(): void {
    // VaultClient n'expose pas de close() — le timer auto-renew est arrêté via process exit
  }
}
