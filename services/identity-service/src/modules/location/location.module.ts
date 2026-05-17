/**
 * @file        location.module.ts
 * @description Module Nest exportant LocationService.
 * @module      identity-service/location
 */

import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
