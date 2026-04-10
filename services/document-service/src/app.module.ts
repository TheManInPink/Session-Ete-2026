/**
 * @file        app.module.ts
 * @description Module racine du microservice document-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      document-service
 */

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
