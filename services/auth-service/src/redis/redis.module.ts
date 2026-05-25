/**
 * @file        redis.module.ts
 * @description Module global Redis (refresh tokens, OTP, throttle, MFA, reset jti).
 *              Marqué `@Global` car presque tous les use-cases auth en dépendent.
 *
 * @module      auth-service/redis
 */

import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
