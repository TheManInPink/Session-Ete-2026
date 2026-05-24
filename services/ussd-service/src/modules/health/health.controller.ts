/**
 * @file        health.controller.ts
 * @description Healthcheck simple — liveness uniquement pour le MVP.
 */

import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  liveness(): { status: 'ok'; service: 'ussd-service'; timestamp: string } {
    return {
      status: 'ok',
      service: 'ussd-service',
      timestamp: new Date().toISOString(),
    };
  }
}
