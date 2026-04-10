/**
 * @file        app.module.ts
 * @description Module racine du microservice auth-service
 * @author      Étudiant UQAR
 * @date        2026
 * @module      auth-service
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { JwksService } from './jwks/jwks.service';
import { WellKnownController } from './well-known/well-known.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  controllers: [AppController, WellKnownController],
  providers: [JwksService],
})
export class AppModule {}
