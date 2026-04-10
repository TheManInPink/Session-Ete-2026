/**
 * @file        app.module.ts
 * @description Module racine du microservice identity-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      identity-service
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
