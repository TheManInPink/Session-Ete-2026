/**
 * @file        index.ts
 * @description Point d'entrée du sous-package NestJS de @nina-aes/logger.
 *              Importer via `@nina-aes/logger/nestjs`.
 *
 * @module      @nina-aes/logger/nestjs
 */

export { AllExceptionsFilter, type ErrorResponse } from './all-exceptions.filter.js';
export {
  CORRELATION_HEADER,
  CorrelationMiddleware,
  REQ_CORRELATION_KEY,
} from './correlation.middleware.js';
export { InjectLogger, LOGGER_TOKEN, LoggerModule } from './logger.module.js';
