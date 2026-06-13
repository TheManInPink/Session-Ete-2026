/**
 * @file        redis.module.ts
 * @description Module GLOBAL exposant {@link RedisService}. Global car le
 *              client Redis est partagé par le rate-limit guard ET le
 *              healthcheck — inutile de le ré-instancier par module.
 *
 * @module      api-gateway/infrastructure/redis
 */
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
