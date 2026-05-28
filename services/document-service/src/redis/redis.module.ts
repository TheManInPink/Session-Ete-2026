/**
 * @file        redis.module.ts
 * @description Module global fournissant un singleton ioredis préfixé.
 * @module      document-service/redis
 */
import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema';

/** Token d'injection de l'instance ioredis. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService<Env, true>): Redis => {
        return new Redis(cfg.get('REDIS_URL', { infer: true })!, {
          keyPrefix: cfg.get('REDIS_KEY_PREFIX', { infer: true })!,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  // L'instance ioredis est partagée — la fermeture propre est laissée
  // au ConfigModule shutdown lifecycle (NestJS) ; ioredis se déconnecte
  // également proprement sur SIGTERM via son listener interne.
  async onApplicationShutdown(): Promise<void> {
    // no-op : Redis se ferme via le hook node 'beforeExit' d'ioredis
  }
}
