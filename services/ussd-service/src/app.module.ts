/**
 * @file        app.module.ts
 * @description Module racine de ussd-service.
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationMiddleware, LoggerModule } from '@nina-aes/logger/nestjs';

import { UssdModule } from './modules/ussd/ussd.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Charge le .env racine du monorepo (cf. auth-service / identity-service).
      envFilePath: ['../../.env', '.env'],
      expandVariables: true,
    }),
    LoggerModule.forRoot({
      service: 'ussd-service',
      environment: process.env.NODE_ENV,
      pretty: process.env.NODE_ENV === 'development',
      gitSha: process.env.GIT_SHA,
    }),
    UssdModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
