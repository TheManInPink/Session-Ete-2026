/**
 * @file        test/mocks/logger-nestjs.ts
 * @description Mock Jest de `@nina-aes/logger/nestjs` (package ESM). Fournit le
 *              strict nécessaire au boot de l'AppModule en test : un
 *              LoggerModule global déposant un logger no-op sous LOGGER_TOKEN,
 *              le décorateur InjectLogger, et un CorrelationMiddleware passe-plat.
 */
import { Inject, Module, type DynamicModule } from '@nestjs/common';

/** Token DI du logger (identité partagée test ↔ src via ce même module mappé). */
export const LOGGER_TOKEN = Symbol('NINA_AES_LOGGER');

/** Logger no-op : on ne veut aucun bruit ni I/O pendant les tests. */
const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
};

/** Décorateur de paramètre — injecte le logger no-op. */
export const InjectLogger = (): ParameterDecorator => Inject(LOGGER_TOKEN);

/** Middleware de corrélation passe-plat (n'altère rien, appelle next). */
export class CorrelationMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    next();
  }
}

/** Filtre d'exception minimal (non sollicité dans les tests de routage). */
export class AllExceptionsFilter {
  catch(): void {}
}

export type ErrorResponse = Record<string, unknown>;
export const CORRELATION_HEADER = 'x-request-id';
export const REQ_CORRELATION_KEY = 'correlationId';

@Module({})
export class LoggerModule {
  static forRoot(opts?: unknown): DynamicModule {
    void opts; // signature compatible avec le vrai LoggerModule.forRoot(options)
    return {
      module: LoggerModule,
      global: true,
      providers: [{ provide: LOGGER_TOKEN, useValue: noopLogger }],
      exports: [LOGGER_TOKEN],
    };
  }
}
