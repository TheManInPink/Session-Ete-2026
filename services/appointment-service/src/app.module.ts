/**
 * @file        app.module.ts
 * @description Module racine du microservice appointment-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
