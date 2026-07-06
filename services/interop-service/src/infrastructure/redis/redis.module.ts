/**
 * @file        redis.module.ts
 * @description Module global exportant RedisService (anti-replay + rate-limit
 *              glissant par pays, fail-closed).
 * @module      interop-service/infrastructure/redis
 */
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
