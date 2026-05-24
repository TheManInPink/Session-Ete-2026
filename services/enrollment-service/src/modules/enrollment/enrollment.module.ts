/**
 * @file        enrollment.module.ts
 * @description Module qui assemble le controller et le service d'enrôlement.
 */

import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({
  controllers: [EnrollmentController],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
