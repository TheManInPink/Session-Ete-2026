/**
 * @file        app.module.ts
 * @description Module racine de enrollment-service.
 */

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { CorrelationMiddleware, LoggerModule } from '@nina-aes/logger/nestjs';

import { EnrollmentModule } from './modules/enrollment/enrollment.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      service: 'enrollment-service',
      environment: process.env.NODE_ENV,
      pretty: process.env.NODE_ENV === 'development',
      gitSha: process.env.GIT_SHA,
    }),
    TerminusModule,
    EnrollmentModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
