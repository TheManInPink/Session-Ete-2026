import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Health check du service d'audit" })
  check() {
    return {
      status: 'healthy',
      service: 'audit-service',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
