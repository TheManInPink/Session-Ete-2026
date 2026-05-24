/**
 * @file        logger.module.ts
 * @description Module NestJS qui packagise le logger NINA-AES en DI.
 *
 *              USAGE — dans le AppModule de chaque service :
 *              ```ts
 *              @Module({
 *                imports: [
 *                  LoggerModule.forRoot({
 *                    service: 'api-gateway',
 *                    environment: process.env.NODE_ENV,
 *                    gitSha: process.env.GIT_SHA,
 *                  }),
 *                ],
 *                providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
 *              })
 *              export class AppModule implements NestModule {
 *                configure(consumer: MiddlewareConsumer) {
 *                  consumer.apply(CorrelationMiddleware).forRoutes('*');
 *                }
 *              }
 *              ```
 *
 *              POURQUOI un module dédié plutôt qu'un simple import direct :
 *              - permet l'injection (`@Inject(LOGGER_TOKEN)`) avec contexte
 *                de service automatiquement configuré
 *              - facilite le mock dans les tests unitaires
 *              - centralise la création du middleware de corrélation
 *
 * @module      @nina-aes/logger/nestjs/logger.module
 */

import { DynamicModule, Global, Inject, Module, Provider } from '@nestjs/common';
import { createLogger } from '../logger.js';
import type { CreateLoggerOptions, StructuredLogger } from '../types.js';
import { CorrelationMiddleware } from './correlation.middleware.js';

/**
 * Token DI à utiliser pour récupérer le logger dans n'importe quel service /
 * controller / pipe / interceptor / filter NestJS.
 *
 * @example
 *   constructor(@Inject(LOGGER_TOKEN) private readonly logger: StructuredLogger) {}
 */
export const LOGGER_TOKEN = Symbol.for('@nina-aes/logger.token');

/**
 * Décorateur de confort qui injecte le logger sans passer par `@Inject`.
 *
 * @example
 *   constructor(@InjectLogger() private readonly logger: StructuredLogger) {}
 */
export const InjectLogger = (): ParameterDecorator => Inject(LOGGER_TOKEN);

@Global()
@Module({})
export class LoggerModule {
  /**
   * Configuration du module au démarrage du service.
   *
   * @param options - Configuration (nom du service, environnement, etc.)
   * @returns DynamicModule prêt à être importé dans `AppModule`.
   */
  static forRoot(options: CreateLoggerOptions): DynamicModule {
    const loggerProvider: Provider = {
      provide: LOGGER_TOKEN,
      useFactory: (): StructuredLogger => createLogger(options),
    };

    const middlewareProvider: Provider = {
      provide: CorrelationMiddleware,
      // Factory : injecte le nom de service dans le middleware
      useFactory: () => new CorrelationMiddleware(options.service),
    };

    return {
      module: LoggerModule,
      providers: [loggerProvider, middlewareProvider],
      exports: [LOGGER_TOKEN, CorrelationMiddleware],
    };
  }
}
