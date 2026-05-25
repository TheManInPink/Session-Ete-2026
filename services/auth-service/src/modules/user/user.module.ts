/**
 * @file        user.module.ts
 * @description Expose {@link UserRepository}.
 *
 * @module      auth-service/modules/user
 */

import { Module } from '@nestjs/common';

import { UserRepository } from './user.repository.js';

@Module({
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UserModule {}
