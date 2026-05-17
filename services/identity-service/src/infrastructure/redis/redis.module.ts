/**
 * @file        redis.module.ts
 * @description Module global exportant RedisService.
 * @module      identity-service/infrastructure/redis
 */

import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
