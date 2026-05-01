/**
 * @file        app.module.ts
 * @description Module racine du microservice identity-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      identity-service
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CitizenModule } from './modules/citizen/citizen.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    CitizenModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
