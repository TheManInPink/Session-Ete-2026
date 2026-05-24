/**
 * @file        proxy.module.ts
 * @description Module qui assemble le ProxyController et le ProxyService.
 */

import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller.js';
import { ProxyService } from './proxy.service.js';

@Module({
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
