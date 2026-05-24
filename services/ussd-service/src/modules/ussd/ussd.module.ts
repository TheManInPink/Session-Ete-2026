/**
 * @file        ussd.module.ts
 * @description Module USSD — controller + service + session.
 */

import { Module } from '@nestjs/common';
import { SessionService } from './session.service.js';
import { UssdController } from './ussd.controller.js';
import { UssdService } from './ussd.service.js';

@Module({
  controllers: [UssdController],
  providers: [SessionService, UssdService],
  exports: [UssdService],
})
export class UssdModule {}
