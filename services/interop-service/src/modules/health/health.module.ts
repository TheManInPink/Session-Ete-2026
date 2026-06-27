/**
 * @file        health.module.ts
 * @description Wire HealthController + Terminus.
 * @module      interop-service/modules/health
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
