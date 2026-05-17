/**
 * @file        index.ts
 * @description Point d'entrée @nina-aes/observability — module NestJS
 *              partagé pour instrumenter les services Bloc A.
 *
 *              Exports :
 *                - ObservabilityModule : module Nest à importer dans AppModule
 *                - startOtelTracing : à appeler AVANT NestFactory.create()
 *                - createPinoLogger : factory logger structuré
 *                - Métriques métier (counters, histograms) types
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/observability
 */

export { ObservabilityModule } from './observability.module.js';
export { startOtelTracing, shutdownOtelTracing } from './tracing.js';
export { createPinoLogger, type PinoLoggerOptions } from './logger.js';
export { BusinessMetrics } from './metrics.js';
export type { ObservabilityConfig } from './types.js';
