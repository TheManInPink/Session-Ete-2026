import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check du service documentaire' })
  check() {
    return {
      status: 'healthy',
      service: 'document-service',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
