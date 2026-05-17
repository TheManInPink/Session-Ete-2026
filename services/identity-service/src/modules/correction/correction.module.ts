/**
 * @file        correction.module.ts
 * @description Module Nest exportant le workflow de correction NINA.
 * @module      identity-service/correction
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CorrectionController } from './correction.controller';
import { CorrectionService } from './correction.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5_000,
      maxRedirects: 0,
      headers: {
        'User-Agent': 'identity-service/0.1.0',
      },
    }),
  ],
  controllers: [CorrectionController],
  providers: [CorrectionService],
  exports: [CorrectionService],
})
export class CorrectionModule {}
