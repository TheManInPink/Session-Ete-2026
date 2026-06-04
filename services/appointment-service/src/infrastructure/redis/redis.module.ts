/**
 * @file        redis.module.ts
 * @description Module global exportant RedisService (file d'attente + blacklist).
 * @module      appointment-service/infrastructure/redis
 */
import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
